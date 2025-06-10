const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

router.post('/convert-to-cmyk-pdf', async (req, res) => {
  console.log("📥 Request received for PDF generation");

  // Check for uploaded file (express-fileupload makes files available on req.files)
  if (!req.files || !req.files.image) {
    console.error("❌ No file uploaded");
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imageFile = req.files.image;
  // Save the uploaded file to a temp path
  const tempDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const inputPath = path.join(tempDir, `${Date.now()}_${imageFile.name}`);
  const tifPath = inputPath + '.tif';
  const outputPath = inputPath + '.pdf';

  // Write file buffer to disk
  fs.writeFileSync(inputPath, imageFile.data);

  console.log("📂 File saved to:", inputPath);

  // Step 1: Convert PNG to CMYK TIFF
  exec(`magick convert "${inputPath}" -colorspace CMYK "${tifPath}"`, (err) => {
    if (err) {
      console.error('🛑 ImageMagick conversion error:', err);
      cleanup();
      return res.status(500).send(`ImageMagick error: ${err.message}`);
    }

    console.log("✅ TIFF generated:", tifPath);

    // Step 2: Convert TIFF to PDF using Ghostscript
    exec(`gswin64c -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sProcessColorModel=DeviceCMYK -sOutputFile="${outputPath}" -f "${tifPath}"`, (err2) => {
      if (err2) {
        console.error('🛑 Ghostscript error:', err2);
        cleanup();
        return res.status(500).send(`Ghostscript error: ${err2.message}`);
      }

      console.log("✅ PDF generated:", outputPath);

      // Step 3: Send PDF with correct headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="document-cmyk.pdf"');
      fs.createReadStream(outputPath)
        .pipe(res)
        .on('close', cleanup)
        .on('error', (streamErr) => {
          console.error("Stream error:", streamErr);
          cleanup();
        });
    });
  });

  // Cleanup function for all temp files
  function cleanup() {
    [inputPath, tifPath, outputPath].forEach(file => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          // ignore
        }
      }
    });
    // Optionally: remove tempDir if empty
    if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
      fs.rmdirSync(tempDir);
    }
    console.log("🧹 Temporary files cleaned up");
  }
});

module.exports = router;