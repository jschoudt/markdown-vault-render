#!/usr/bin/env python3
"""
Post-processor for Godsfell Word documents (.docx).
Detects 1x1 statblock tables and BlockText/NPC callout paragraphs in Pandoc output,
applying clean borders, padding, background shading, full margin-to-margin width,
and page-break rules.
"""

import sys
import os
import zipfile
import io
import xml.etree.ElementTree as ET

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ET.register_namespace('w', W_NS)

TBL_ORDER = [
    'tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblW', 'tblInd',
    'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription'
]

TC_ORDER = [
    'cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd',
    'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark', 'headers'
]

P_ORDER = [
    'pStyle', 'keepNext', 'keepLines', 'pBdr', 'shd', 'spacing', 'ind', 'jc', 'rPr'
]

def reorder_children(elem, tag_order):
    tag_to_index = {tag: i for i, tag in enumerate(tag_order)}
    children = list(elem)
    children.sort(key=lambda c: tag_to_index.get(c.tag.split('}')[-1], 999))
    elem[:] = children

def style_statblocks_in_docx(docx_path):
    if not os.path.exists(docx_path):
        print(f"Error: file not found: {docx_path}", file=sys.stderr)
        return False

    with zipfile.ZipFile(docx_path, 'r') as zin:
        doc_xml = zin.read('word/document.xml').decode('utf-8')

    has_statblocks = '__GODSFELL_STATBLOCK_START__' in doc_xml
    has_blocktext = 'BlockText' in doc_xml

    if not has_statblocks and not has_blocktext:
        return True

    tree = ET.fromstring(doc_xml.encode('utf-8'))

    # Calculate printable width from section settings (page width minus left and right margins)
    pgSz = tree.find(f'.//{{{W_NS}}}pgSz')
    pgMar = tree.find(f'.//{{{W_NS}}}pgMar')
    page_w = int(pgSz.get(f'{{{W_NS}}}w', '12240')) if pgSz is not None else 12240
    left_m = int(pgMar.get(f'{{{W_NS}}}left', '360')) if pgMar is not None else 360
    right_m = int(pgMar.get(f'{{{W_NS}}}right', '360')) if pgMar is not None else 360
    printable_w = max(1000, page_w - left_m - right_m)

    statblock_count = 0
    blocktext_count = 0

    # 1. Process 1x1 statblock tables
    for tbl in tree.iter(f'{{{W_NS}}}tbl'):
        has_marker = False
        marker_p = None
        target_tc = None

        for tc in tbl.iter(f'{{{W_NS}}}tc'):
            for p in list(tc):
                if p.tag == f'{{{W_NS}}}p':
                    text = ''.join(p.itertext())
                    if '__GODSFELL_STATBLOCK_START__' in text:
                        has_marker = True
                        marker_p = p
                        target_tc = tc
                        break
            if has_marker:
                break

        if has_marker and target_tc is not None and marker_p is not None:
            statblock_count += 1
            # Remove the marker paragraph from the cell
            target_tc.remove(marker_p)

            # Add subtle light grey card background (#F9F9F9) and full-width to outer cell
            tcPr = target_tc.find(f'{{{W_NS}}}tcPr')
            if tcPr is None:
                tcPr = ET.Element(f'{{{W_NS}}}tcPr')
                target_tc.insert(0, tcPr)

            for old_tcw in list(tcPr.findall(f'{{{W_NS}}}tcW')):
                tcPr.remove(old_tcw)
            tcW = ET.Element(f'{{{W_NS}}}tcW')
            tcW.set(f'{{{W_NS}}}w', '5000')
            tcW.set(f'{{{W_NS}}}type', 'pct')
            tcPr.append(tcW)

            for old_shd in list(tcPr.findall(f'{{{W_NS}}}shd')):
                tcPr.remove(old_shd)
            shd = ET.Element(f'{{{W_NS}}}shd')
            shd.set(f'{{{W_NS}}}val', 'clear')
            shd.set(f'{{{W_NS}}}color', 'auto')
            shd.set(f'{{{W_NS}}}fill', 'F9F9F9')
            tcPr.append(shd)

            reorder_children(tcPr, TC_ORDER)

            # Add cantSplit to row so statblocks don't split awkwardly across pages
            tr = tbl.find(f'{{{W_NS}}}tr')
            if tr is not None:
                trPr = tr.find(f'{{{W_NS}}}trPr')
                if trPr is None:
                    trPr = ET.Element(f'{{{W_NS}}}trPr')
                    tr.insert(0, trPr)
                if trPr.find(f'{{{W_NS}}}cantSplit') is None:
                    cantSplit = ET.Element(f'{{{W_NS}}}cantSplit')
                    trPr.append(cantSplit)

            # Configure table properties (borders, padding, full margin-to-margin width)
            tblPr = tbl.find(f'{{{W_NS}}}tblPr')
            if tblPr is None:
                tblPr = ET.Element(f'{{{W_NS}}}tblPr')
                tbl.insert(0, tblPr)

            for old_tblw in list(tblPr.findall(f'{{{W_NS}}}tblW')):
                tblPr.remove(old_tblw)
            tblW = ET.Element(f'{{{W_NS}}}tblW')
            tblW.set(f'{{{W_NS}}}w', '5000')
            tblW.set(f'{{{W_NS}}}type', 'pct')
            tblPr.append(tblW)

            for old_ind in list(tblPr.findall(f'{{{W_NS}}}tblInd')):
                tblPr.remove(old_ind)
            tblInd = ET.Element(f'{{{W_NS}}}tblInd')
            tblInd.set(f'{{{W_NS}}}w', '0')
            tblInd.set(f'{{{W_NS}}}type', 'dxa')
            tblPr.append(tblInd)

            for old_borders in list(tblPr.findall(f'{{{W_NS}}}tblBorders')):
                tblPr.remove(old_borders)
            tblBorders = ET.Element(f'{{{W_NS}}}tblBorders')
            for b_name in ['top', 'left', 'bottom', 'right']:
                b = ET.Element(f'{{{W_NS}}}{b_name}')
                b.set(f'{{{W_NS}}}val', 'single')
                b.set(f'{{{W_NS}}}sz', '12')  # 1.5 pt
                b.set(f'{{{W_NS}}}space', '0')
                b.set(f'{{{W_NS}}}color', '333333')
                tblBorders.append(b)
            for b_name in ['insideH', 'insideV']:
                b = ET.Element(f'{{{W_NS}}}{b_name}')
                b.set(f'{{{W_NS}}}val', 'none')
                tblBorders.append(b)
            tblPr.append(tblBorders)

            for old_mar in list(tblPr.findall(f'{{{W_NS}}}tblCellMar')):
                tblPr.remove(old_mar)
            tblCellMar = ET.Element(f'{{{W_NS}}}tblCellMar')
            for m_name, val in [('top', '120'), ('left', '180'), ('bottom', '120'), ('right', '180')]:
                m = ET.Element(f'{{{W_NS}}}{m_name}')
                m.set(f'{{{W_NS}}}w', val)
                m.set(f'{{{W_NS}}}type', 'dxa')
                tblCellMar.append(m)
            tblPr.append(tblCellMar)

            reorder_children(tblPr, TBL_ORDER)

            # Set gridCol on the outer table to match the exact printable width
            tblGrid = tbl.find(f'{{{W_NS}}}tblGrid')
            if tblGrid is not None:
                tblGrid.clear()
            else:
                tblGrid = ET.Element(f'{{{W_NS}}}tblGrid')
                idx = list(tbl).index(tblPr) + 1 if tblPr in list(tbl) else 0
                tbl.insert(idx, tblGrid)
            gridCol = ET.SubElement(tblGrid, f'{{{W_NS}}}gridCol')
            gridCol.set(f'{{{W_NS}}}w', str(printable_w))

            # Format any nested inner tables (e.g. the 6-attribute score table)
            inner_avail_w = max(500, printable_w - 360)
            for inner_tbl in target_tc.iter(f'{{{W_NS}}}tbl'):
                if inner_tbl == tbl:
                    continue

                inner_tblPr = inner_tbl.find(f'{{{W_NS}}}tblPr')
                if inner_tblPr is None:
                    inner_tblPr = ET.Element(f'{{{W_NS}}}tblPr')
                    inner_tbl.insert(0, inner_tblPr)

                for old_w in list(inner_tblPr.findall(f'{{{W_NS}}}tblW')):
                    inner_tblPr.remove(old_w)
                in_w = ET.Element(f'{{{W_NS}}}tblW')
                in_w.set(f'{{{W_NS}}}w', '5000')
                in_w.set(f'{{{W_NS}}}type', 'pct')
                inner_tblPr.append(in_w)

                for old_ind in list(inner_tblPr.findall(f'{{{W_NS}}}tblInd')):
                    inner_tblPr.remove(old_ind)
                in_ind = ET.Element(f'{{{W_NS}}}tblInd')
                in_ind.set(f'{{{W_NS}}}w', '0')
                in_ind.set(f'{{{W_NS}}}type', 'dxa')
                inner_tblPr.append(in_ind)

                reorder_children(inner_tblPr, TBL_ORDER)

                inner_grid = inner_tbl.find(f'{{{W_NS}}}tblGrid')
                if inner_grid is not None:
                    cols = inner_grid.findall(f'{{{W_NS}}}gridCol')
                    if cols:
                        col_w = inner_avail_w // len(cols)
                        for c in cols:
                            c.set(f'{{{W_NS}}}w', str(col_w))
                        for row in inner_tbl.findall(f'.//{{{W_NS}}}tr'):
                            for cell in row.findall(f'{{{W_NS}}}tc'):
                                cell_tcPr = cell.find(f'{{{W_NS}}}tcPr')
                                if cell_tcPr is None:
                                    cell_tcPr = ET.Element(f'{{{W_NS}}}tcPr')
                                    cell.insert(0, cell_tcPr)
                                for c_tcw in list(cell_tcPr.findall(f'{{{W_NS}}}tcW')):
                                    cell_tcPr.remove(c_tcw)
                                c_w = ET.Element(f'{{{W_NS}}}tcW')
                                c_w.set(f'{{{W_NS}}}w', str(col_w))
                                c_w.set(f'{{{W_NS}}}type', 'dxa')
                                cell_tcPr.append(c_w)
                                reorder_children(cell_tcPr, TC_ORDER)

    # 2. Process BlockText paragraphs (NPC callout boxes and blockquotes)
    for p in tree.iter(f'{{{W_NS}}}p'):
        pPr = p.find(f'{{{W_NS}}}pPr')
        if pPr is not None:
            pStyle = pPr.find(f'{{{W_NS}}}pStyle')
            if pStyle is not None and pStyle.get(f'{{{W_NS}}}val') == 'BlockText':
                blocktext_count += 1

                # Direct paragraph borders for complete Word Online and desktop rendering
                pBdr = pPr.find(f'{{{W_NS}}}pBdr')
                if pBdr is None:
                    pBdr = ET.Element(f'{{{W_NS}}}pBdr')
                    pPr.append(pBdr)
                pBdr.clear()

                for b_name, val, sz, space, col in [
                    ('top', 'single', '8', '6', 'CCCCCC'),
                    ('left', 'single', '24', '8', '333333'),
                    ('bottom', 'single', '8', '6', 'CCCCCC'),
                    ('right', 'single', '8', '6', 'CCCCCC')
                ]:
                    b = ET.SubElement(pBdr, f'{{{W_NS}}}{b_name}')
                    b.set(f'{{{W_NS}}}val', val)
                    b.set(f'{{{W_NS}}}sz', sz)
                    b.set(f'{{{W_NS}}}space', space)
                    b.set(f'{{{W_NS}}}color', col)

                # Shading #F6F6F6
                shd = pPr.find(f'{{{W_NS}}}shd')
                if shd is None:
                    shd = ET.Element(f'{{{W_NS}}}shd')
                    pPr.append(shd)
                shd.set(f'{{{W_NS}}}val', 'clear')
                shd.set(f'{{{W_NS}}}color', 'auto')
                shd.set(f'{{{W_NS}}}fill', 'F6F6F6')

                # Indent & Spacing
                ind = pPr.find(f'{{{W_NS}}}ind')
                if ind is None:
                    ind = ET.Element(f'{{{W_NS}}}ind')
                    pPr.append(ind)
                ind.set(f'{{{W_NS}}}firstLine', '0')
                ind.set(f'{{{W_NS}}}left', '180')
                ind.set(f'{{{W_NS}}}right', '180')

                spacing = pPr.find(f'{{{W_NS}}}spacing')
                if spacing is None:
                    spacing = ET.Element(f'{{{W_NS}}}spacing')
                    pPr.append(spacing)
                spacing.set(f'{{{W_NS}}}before', '80')
                spacing.set(f'{{{W_NS}}}after', '80')
                spacing.set(f'{{{W_NS}}}line', '264')
                spacing.set(f'{{{W_NS}}}lineRule', 'auto')

                # Keep box on one page to prevent border breaks across page boundaries
                if pPr.find(f'{{{W_NS}}}keepLines') is None:
                    pPr.append(ET.Element(f'{{{W_NS}}}keepLines'))

                reorder_children(pPr, P_ORDER)

                # Ensure all runs inside are italicized
                for r in p.findall(f'{{{W_NS}}}r'):
                    rPr = r.find(f'{{{W_NS}}}rPr')
                    if rPr is None:
                        rPr = ET.Element(f'{{{W_NS}}}rPr')
                        r.insert(0, rPr)
                    if rPr.find(f'{{{W_NS}}}i') is None:
                        ET.SubElement(rPr, f'{{{W_NS}}}i')
                    if rPr.find(f'{{{W_NS}}}iCs') is None:
                        ET.SubElement(rPr, f'{{{W_NS}}}iCs')

    if statblock_count > 0 or blocktext_count > 0:
        new_doc_xml = ET.tostring(tree, encoding='utf-8', xml_declaration=True)

        bio = io.BytesIO()
        with zipfile.ZipFile(docx_path, 'r') as zin:
            with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    if item.filename == 'word/document.xml':
                        zout.writestr(item, new_doc_xml)
                    else:
                        zout.writestr(item, zin.read(item.filename))

        with open(docx_path, 'wb') as f:
            f.write(bio.getvalue())

        details = []
        if statblock_count > 0:
            details.append(f"{statblock_count} statblock(s)")
        if blocktext_count > 0:
            details.append(f"{blocktext_count} NPC/callout block(s)")
        print(f"✨ Applied custom borders & card styling to {', '.join(details)}")

    return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 style-statblocks.py <path-to-docx>")
        sys.exit(1)

    success = style_statblocks_in_docx(sys.argv[1])
    sys.exit(0 if success else 1)
