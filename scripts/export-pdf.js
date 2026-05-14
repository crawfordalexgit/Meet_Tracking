const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function exportSquadPDF(squadId, squadName) {
    console.log(`Starting PDF Export for: ${squadName} (${squadId})...`);
    
    const browser = await puppeteer.launch({
        headless: "new"
    });
    const page = await browser.newPage();

    // Navigate to the local dev server squad page with the rosterOnly flag
    const url = `http://localhost:3000/squad/${squadId}?rosterOnly=true`;
    console.log(`Navigating to: ${url}`);
    
    await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 60000
    });

    // Ensure the reports directory exists
    const reportsDir = path.join(__dirname, '..', 'Reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    const fileName = `Squad_Compliance_Audit_${squadName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    const outputPath = path.join(reportsDir, fileName);

    console.log(`Generating PDF: ${fileName}...`);

    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
            top: '0px',
            right: '0px',
            bottom: '0px',
            left: '0px'
        },
        displayHeaderFooter: false
    });

    await browser.close();
    console.log(`Success! Report saved to: ${outputPath}`);
}

// Check for command line arguments
const squadId = process.argv[2] || 'c360282a-90b3-4f96-b3bb-ef105508347e'; // Default to Age Development
const squadName = process.argv[3] || 'Age Development';

exportSquadPDF(squadId, squadName).catch(err => {
    console.error('PDF Export Failed:', err);
    process.exit(1);
});
