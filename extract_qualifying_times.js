const fs = require('fs');
const path = require('path');
const PDFParser = require("pdf2json");

async function extractPDF(filePath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(this, 1);
        
        pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", pdfData => {
            resolve(pdfParser.getRawTextContent());
        });
        
        pdfParser.loadPDF(filePath);
    });
}

async function main() {
    const qtDir = path.join(__dirname, 'QualifyingTimes');
    const files = fs.readdirSync(qtDir).filter(f => f.endsWith('.pdf'));
    
    for (const file of files) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`FILE: ${file}`);
        console.log(`${'='.repeat(80)}\n`);
        const text = await extractPDF(path.join(qtDir, file));
        console.log(text);
    }
}

main().catch(console.error);
