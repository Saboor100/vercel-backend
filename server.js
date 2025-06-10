require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const authRoutes = require('./routes/auth.routes');
const resumeRoutes = require('./routes/resume.routes');
const coverLetterRoutes = require('./routes/coverLetter.routes');
const paymentRoutes = require('./routes/payment.routes');
const adminRoutes = require('./routes/admin.routes');
const pdfRoutes = require('./routes/pdfRoutes');
const fileUpload = require('express-fileupload');

// Initialize Firebase Admin
require('./services/firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced CORS configuration for Vercel
const corsOptions = {
  origin: [
    process.env.CLIENT_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://localhost:5173',
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// File upload configuration optimized for Vercel
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  useTempFiles: false, // Use memory instead of temp files for Vercel
  createParentPath: true
}));

// Add the raw body parser for Stripe webhook before json parser
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Other middleware - IMPORTANT: This comes AFTER the webhook middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Only use morgan in development to reduce serverless function overhead
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health check endpoints
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to the API root. Available endpoints: /auth, /resume, /cover-letter, /payment, /admin, /pdf',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running on Vercel',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/cover-letter', coverLetterRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', pdfRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Handle 404 for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Local development server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API URL: http://localhost:${PORT}/api`);
  });
}

// Export for Vercel - Single export
module.exports = app;