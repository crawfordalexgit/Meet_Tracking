const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const pdfPath = 'C:\\Users\\alex\\.claude\\projects\\C--Users-alex-OneDrive---Mogwai-Consultants-00-Tonbridge-Swimming-Scripts-Open-Meet-Dashboard---Claude\\665abfb1-877f-4149-a352-f962d3da6be1\\tool-results\\webfetch-1781886064001-b8af2m.pdf';
const data = fs.readFileSync(pdfPath);
const parser = new PDFParse();
parser.parseBuffer(data).then(r => console.log(r.text)).catch(e => console.error(e));
