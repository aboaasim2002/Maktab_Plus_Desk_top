$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$workspace = (Resolve-Path $PSScriptRoot).Path
$htmlFile = Get-ChildItem -LiteralPath $workspace -Filter '*.html' |
    Where-Object { $_.Length -gt 10000 } |
    Select-Object -First 1

if (-not $htmlFile) {
    throw 'HTML guide was not found.'
}

$docxPath = Join-Path $workspace 'Maktab-Plus-Arabic-User-Guide.docx'
$html = [System.IO.File]::ReadAllText($htmlFile.FullName, [System.Text.Encoding]::UTF8)

$bodyMatch = [regex]::Match($html, '(?is)<body[^>]*>(.*)</body>')
if (-not $bodyMatch.Success) {
    throw 'The HTML body could not be read.'
}

$text = $bodyMatch.Groups[1].Value
$text = [regex]::Replace($text, '(?is)<(style|script)[^>]*>.*?</\1>', '')
$text = [regex]::Replace($text, '(?is)<h1[^>]*>', "`n@@H1@@")
$text = [regex]::Replace($text, '(?is)<h2[^>]*>', "`n@@H2@@")
$text = [regex]::Replace($text, '(?is)<h3[^>]*>', "`n@@H3@@")
$text = [regex]::Replace($text, '(?is)<h4[^>]*>', "`n@@H4@@")
$text = [regex]::Replace($text, '(?is)<li[^>]*>', "`n@@LI@@")
$text = [regex]::Replace($text, '(?is)<p[^>]*>', "`n@@P@@")
$text = [regex]::Replace($text, '(?is)<div[^>]*>', "`n@@P@@")
$text = [regex]::Replace($text, '(?is)<tr[^>]*>', "`n@@P@@")
$text = [regex]::Replace($text, '(?is)</t[dh]>', ' | ')
$text = [regex]::Replace($text, '(?is)<br\s*/?>', "`n")
$text = [regex]::Replace($text, '(?is)</?(section|ol|ul|table|thead|tbody|tr|td|th|p|div|h1|h2|h3|h4|li)[^>]*>', '')
$text = [regex]::Replace($text, '(?is)<[^>]+>', '')
$text = [System.Net.WebUtility]::HtmlDecode($text)
$text = $text -replace [char]0x00A0, ' '

function Escape-Xml([string]$value) {
    if ($null -eq $value) { return '' }
    return [System.Security.SecurityElement]::Escape($value)
}

function New-ParagraphXml([string]$line) {
    $style = 'Normal'
    $fontSize = 27
    $bold = $false
    $before = 40
    $after = 80

    if ($line.StartsWith('@@H1@@')) {
        $style = 'Title'
        $fontSize = 52
        $bold = $true
        $before = 200
        $after = 180
        $line = $line.Substring(6)
    }
    elseif ($line.StartsWith('@@H2@@')) {
        $style = 'Heading1'
        $fontSize = 38
        $bold = $true
        $before = 260
        $after = 120
        $line = $line.Substring(6)
    }
    elseif ($line.StartsWith('@@H3@@')) {
        $style = 'Heading2'
        $fontSize = 31
        $bold = $true
        $before = 190
        $after = 90
        $line = $line.Substring(6)
    }
    elseif ($line.StartsWith('@@H4@@')) {
        $style = 'Heading3'
        $fontSize = 28
        $bold = $true
        $before = 140
        $after = 70
        $line = $line.Substring(6)
    }
    elseif ($line.StartsWith('@@LI@@')) {
        $line = [char]0x2022 + ' ' + $line.Substring(6)
        $before = 20
        $after = 45
    }
    elseif ($line.StartsWith('@@P@@')) {
        $line = $line.Substring(5)
    }

    $line = [regex]::Replace($line, '\s+', ' ').Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { return '' }

    $escaped = Escape-Xml $line
    $boldXml = if ($bold) { '<w:b/><w:bCs/>' } else { '' }

    return @"
<w:p>
  <w:pPr>
    <w:pStyle w:val="$style"/>
    <w:bidi/>
    <w:jc w:val="right"/>
    <w:spacing w:before="$before" w:after="$after" w:line="360" w:lineRule="auto"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rtl/>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
      $boldXml
      <w:color w:val="172033"/>
      <w:sz w:val="$fontSize"/>
      <w:szCs w:val="$fontSize"/>
    </w:rPr>
    <w:t xml:space="preserve">$escaped</w:t>
  </w:r>
</w:p>
"@
}

$paragraphs = New-Object System.Collections.Generic.List[string]
foreach ($rawLine in ($text -split "`r?`n")) {
    $paragraph = New-ParagraphXml $rawLine
    if ($paragraph) { $paragraphs.Add($paragraph) }
}

$documentBody = [string]::Join("`n", $paragraphs)
$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $documentBody
    <w:sectPr>
      <w:bidi/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="500" w:footer="500" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:rtl/><w:sz w:val="27"/><w:szCs w:val="27"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/></w:style>
</w:styles>
'@

$contentTypesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
'@

$relsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

$documentRelsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@

function Add-ZipTextEntry($archive, [string]$name, [string]$content) {
    $entry = $archive.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($false)))
    try {
        $writer.Write($content)
    }
    finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

if (Test-Path -LiteralPath $docxPath) {
    Remove-Item -LiteralPath $docxPath -Force
}

$fileStream = [System.IO.File]::Open($docxPath, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
    Add-ZipTextEntry $archive '[Content_Types].xml' $contentTypesXml
    Add-ZipTextEntry $archive '_rels/.rels' $relsXml
    Add-ZipTextEntry $archive 'word/document.xml' $documentXml
    Add-ZipTextEntry $archive 'word/styles.xml' $stylesXml
    Add-ZipTextEntry $archive 'word/_rels/document.xml.rels' $documentRelsXml
}
finally {
    $archive.Dispose()
    $fileStream.Dispose()
}

Get-Item -LiteralPath $docxPath | Select-Object FullName, Length, LastWriteTime
