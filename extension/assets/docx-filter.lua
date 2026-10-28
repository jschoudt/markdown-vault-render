-- Pandoc Lua filter for Microsoft Word (.docx) output
-- Optimizes horizontal rules, page breaks, relative markdown links, and HTML containers

function HorizontalRule()
  -- Render horizontal rules as clean OpenXML paragraph bottom borders
  -- This replaces the deprecated VML <v:rect> that renders poorly in Word Online
  return pandoc.RawBlock('openxml', 
    '<w:p><w:pPr>' ..
    '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="8" w:color="777777"/></w:pBdr>' ..
    '<w:spacing w:before="140" w:after="140"/>' ..
    '</w:pPr></w:p>'
  )
end

function RawBlock(el)
  if el.format == 'html' then
    local text = el.text:lower()
    -- Convert page-break classes or comments to native OpenXML page breaks
    if text:match('class=["\'][^"\']*page%-break') or 
       text:match('class=["\'][^"\']*encounter%-sheet') or
       text:match('<!%-%-%s*pagebreak%s*%-%->') then
      return pandoc.RawBlock('openxml', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    end
    -- Remove non-semantic div wrappers (statblock, encounter containers, etc.)
    if text:match('^</?div') or text:match('^</?span') or text:match('^<!%-%-') then
      return {}
    end
  end
  return el
end

function RawInline(el)
  if el.format == 'html' then
    local text = el.text:lower()
    if text:match('^</?div') or text:match('^</?span') or text:match('^<!%-%-') then
      return {}
    end
  end
  return el
end

function Link(el)
  -- Rewrite relative markdown links (.md) to .docx so relative links work across documents in Word
  if el.target then
    -- Don't touch external URLs (http, https, mailto)
    if not (el.target:match('^https?:') or el.target:match('^mailto:')) then
      if el.target:match('%.md$') then
        el.target = el.target:gsub('%.md$', '.docx')
      elseif el.target:match('%.md(#.*)$') then
        el.target = el.target:gsub('%.md(#.*)$', '.docx%1')
      end
    end
  end
  return el
end

function Div(el)
  if el.classes:includes('statblock') then
    -- Mark statblock with unique identifier and wrap in a 1x1 table
    local marker = pandoc.Para({pandoc.Str('__GODSFELL_STATBLOCK_START__')})
    table.insert(el.content, 1, marker)
    local cell = pandoc.Cell(el.content)
    local row = pandoc.Row({cell})
    local body = pandoc.TableBody({row})
    return pandoc.Table(pandoc.Caption(''), { {pandoc.AlignDefault, pandoc.ColWidthDefault} }, pandoc.TableHead({}), {body}, pandoc.TableFoot({}))
  end
  return el
end
