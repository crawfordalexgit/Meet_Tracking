import { readFileSync } from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const pdfPath = String.raw`C:\Users\alex\.claude\projects\C--Users-alex-OneDrive---Mogwai-Consultants-00-Tonbridge-Swimming-Scripts-Open-Meet-Dashboard---Claude\665abfb1-877f-4149-a352-f962d3da6be1\tool-results\webfetch-1781886064001-b8af2m.pdf`;
const data = readFileSync(pdfPath);
const result = await pdfParse(data);
console.log(result.text);
