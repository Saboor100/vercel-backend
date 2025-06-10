const express = require('express');
const router = express.Router();
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

router.post('/convert-to-cmyk-pdf', async (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(400).send('No image file uploaded.');
  }

  const image = req.files.image;
  const uploadDir = path.join(__dirname, 'tmp');

  const timestamp = Date.now();
  const inputPath = path.join(uploadDir, `input-${timestamp}.png`);

  try {
    await fs.mkdir(uploadDir, { recursive: true });
    await image.mv(inputPath);

    const { width: imgWidth, height: imgHeight } = await sharp(inputPath).metadata();

    const A4_WIDTH = 595.28;
    const A4_HEIGHT = 841.89;
    const scale = Math.min(A4_WIDTH / imgWidth, A4_HEIGHT / imgHeight);
    const visibleHeightPx = Math.floor((A4_HEIGHT / scale));
    const totalPages = Math.ceil(imgHeight / visibleHeightPx);

    const pdfDoc = await PDFDocument.create();

    const sharpImage = sharp(inputPath);

    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      const top = pageNum * visibleHeightPx;
      const height = Math.min(visibleHeightPx, imgHeight - top);

      const slice = await sharpImage
        .clone()
        .extract({ left: 0, top: Math.floor(top), width: imgWidth, height: Math.floor(height) })
        .png()
        .toBuffer();

      const embeddedImage = await pdfDoc.embedPng(slice);
      const scaledHeight = height * scale;
      const scaledWidth = imgWidth * scale;
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

      page.drawImage(embeddedImage, {
        x: (A4_WIDTH - scaledWidth) / 2,
        y: A4_HEIGHT - scaledHeight,
        width: scaledWidth,
        height: scaledHeight,
      });
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=output-cmyk.pdf');
    res.setHeader('Content-Length', pdfBytes.length);

    res.end(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('Error generating CMYK PDF:', err);
    res.status(500).send('Error generating CMYK-style PDF');
  } finally {
    // Cleanup in finally block ensures deletion even on error
    fs.unlink(inputPath).catch(() => {});
  }
});

module.exports = router;
