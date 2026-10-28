const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

/**
 * Open a rendered document in the IDE or system default viewer.
 */
async function openDocumentFile(filePath, forceExternal = false) {
  const uri = vscode.Uri.file(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // DOCX files are always opened with the external OS app (Word/Pages/LibreOffice)
  if (ext === '.docx' || forceExternal) {
    if (process.platform === 'darwin') {
      execFile('open', [filePath], (err) => {
        if (err) vscode.env.openExternal(uri);
      });
      return;
    }
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', filePath], (err) => {
        if (err) vscode.env.openExternal(uri);
      });
      return;
    }
    await vscode.env.openExternal(uri);
    return;
  }

  // PDF handling
  const config = vscode.workspace.getConfiguration('markdownVaultRender');
  const openTarget = config.get('openTarget', 'ide');
  const viewColumnSetting = config.get('viewColumn', 'beside');

  if (openTarget === 'none') {
    return;
  }

  if (openTarget === 'os') {
    return openDocumentFile(filePath, true);
  }

  const viewColumn = viewColumnSetting === 'active'
    ? vscode.ViewColumn.Active
    : vscode.ViewColumn.Beside;

  try {
    await vscode.commands.executeCommand('vscode.open', uri, {
      viewColumn,
      preview: false
    });
  } catch (err) {
    try {
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (err2) {
      await openDocumentFile(filePath, true);
    }
  }
}

/**
 * Find workspace root for a given file path.
 */
function getWorkspaceRoot(uri, filePath) {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (wsFolder) {
    return wsFolder.uri.fsPath;
  }

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  let curr = path.dirname(filePath);
  while (curr && curr !== path.dirname(curr)) {
    if (
      fs.existsSync(path.join(curr, '.git')) ||
      fs.existsSync(path.join(curr, '.obsidian')) ||
      fs.existsSync(path.join(curr, '.vscode'))
    ) {
      return curr;
    }
    curr = path.dirname(curr);
  }

  return path.dirname(filePath);
}

/**
 * Renders a single markdown file using bundled runner.js.
 */
function renderSingleFile(filePath, workspaceRoot, format, token) {
  return new Promise((resolve) => {
    if (token && token.isCancellationRequested) {
      return resolve({
        success: false,
        outputPath: '',
        cancelled: true,
        error: 'Rendering cancelled by user'
      });
    }

    const runnerScript = path.join(__dirname, 'runner.js');

    const child = spawn(process.execPath || 'node', [runnerScript, format, filePath, workspaceRoot], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      }
    });

    let stdout = '';
    let stderr = '';
    let isDone = false;

    const cleanup = () => {
      isDone = true;
      if (cancelDisposable) {
        cancelDisposable.dispose();
      }
    };

    let cancelDisposable = null;
    if (token) {
      cancelDisposable = token.onCancellationRequested(() => {
        if (!isDone) {
          try {
            child.kill('SIGTERM');
          } catch {}
          cleanup();
          resolve({
            success: false,
            outputPath: '',
            cancelled: true,
            error: 'Rendering cancelled by user'
          });
        }
      });
    }

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (isDone) return;
      cleanup();

      let outputPath = '';
      const match = stdout.match(/OUTPUT_FILE:(.+)/);
      if (match) {
        outputPath = match[1].trim();
      }

      if (code === 0 && outputPath && fs.existsSync(outputPath)) {
        resolve({
          success: true,
          outputPath
        });
      } else {
        const errorMsg = (stderr || stdout || `Process exited with code ${code}`).trim();
        resolve({
          success: false,
          outputPath,
          error: errorMsg
        });
      }
    });

    child.on('error', (err) => {
      if (isDone) return;
      cleanup();
      resolve({
        success: false,
        outputPath: '',
        error: err.message
      });
    });
  });
}

function handleRenderCommand(format) {
  return async (uri, uris) => {
    // 1. Collect target files
    let targets = [];

    if (uris && Array.isArray(uris) && uris.length > 0) {
      for (const u of uris) {
        if (u && u.fsPath && u.fsPath.endsWith('.md')) {
          targets.push({ uri: u, path: u.fsPath });
        }
      }
    }

    if (targets.length === 0) {
      let singleUri = uri && uri.fsPath ? uri : null;
      if (!singleUri) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document && editor.document.uri) {
          singleUri = editor.document.uri;
        }
      }

      if (singleUri && singleUri.fsPath && singleUri.fsPath.endsWith('.md')) {
        targets.push({ uri: singleUri, path: singleUri.fsPath });
      }
    }

    if (targets.length === 0) {
      vscode.window.showErrorMessage('Please select or open a Markdown (.md) file to render.');
      return;
    }

    // 2. Save any dirty open documents matching targets
    for (const target of targets) {
      const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === target.path);
      if (openDoc && openDoc.isDirty) {
        await openDoc.save();
      }
    }

    // 3. Render files with progress notification
    const formatLabel = format.toUpperCase();
    const title = targets.length === 1
      ? `Rendering ${path.basename(targets[0].path)} to ${formatLabel}...`
      : `Rendering ${targets.length} Markdown files to ${formatLabel}...`;

    let lastRenderedFile = null;
    let successCount = 0;
    let userCancelled = false;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title,
          cancellable: true
        },
        async (progress, token) => {
          for (let i = 0; i < targets.length; i++) {
            if (token.isCancellationRequested) {
              userCancelled = true;
              break;
            }

            const item = targets[i];
            const fileName = path.basename(item.path);
            progress.report({ message: `(${i + 1}/${targets.length}) ${fileName}` });

            const wsRoot = getWorkspaceRoot(item.uri, item.path);
            const result = await renderSingleFile(item.path, wsRoot, format, token);

            if (result.cancelled || token.isCancellationRequested) {
              userCancelled = true;
              break;
            }

            if (result.success) {
              successCount++;
              lastRenderedFile = result.outputPath;
            } else {
              vscode.window.showErrorMessage(`Failed to render ${fileName}: ${result.error}`);
            }
          }
        }
      );
    } catch (err) {
      console.error('Error during rendering progress:', err);
    }

    if (userCancelled) {
      vscode.window.showInformationMessage(`${formatLabel} rendering was cancelled.`);
      return;
    }

    if (lastRenderedFile && fs.existsSync(lastRenderedFile)) {
      try {
        await openDocumentFile(lastRenderedFile, false);
      } catch (e) {
        console.error('Error opening rendered file:', e);
      }

      const relPath = vscode.workspace.asRelativePath(lastRenderedFile);
      const msg = targets.length === 1
        ? `Successfully rendered ${path.basename(lastRenderedFile)}`
        : `Rendered ${successCount} documents (${relPath})`;

      const actions = format === 'pdf'
        ? ['Re-open in IDE', 'Open in OS Viewer', 'Show in Explorer']
        : ['Open in Word/OS', 'Show in Explorer'];

      vscode.window.showInformationMessage(msg, ...actions).then(async (action) => {
        if (action === 'Re-open in IDE') {
          await openDocumentFile(lastRenderedFile, false);
        } else if (action === 'Open in OS Viewer' || action === 'Open in Word/OS') {
          await openDocumentFile(lastRenderedFile, true);
        } else if (action === 'Show in Explorer') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(lastRenderedFile));
        }
      });
    }
  };
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownVaultRender.renderPdf', handleRenderCommand('pdf')),
    vscode.commands.registerCommand('markdownVaultRender.renderDocx', handleRenderCommand('docx')),
    vscode.commands.registerCommand('godsfell.renderPdf', handleRenderCommand('pdf'))
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
