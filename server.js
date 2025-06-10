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

// Enhanced CORS configuration for Vercel deployment AND mobile apps
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins - update these with your actual Vercel URLs
    const allowedOrigins = [
      process.env.CLIENT_URL || 'https://vercel-frontend-one-olive.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5000',
      'https://vercel-frontend-one-olive.vercel.app',
      // Mobile app origins for Capacitor
      'capacitor://localhost',
      'http://localhost',
      'https://localhost',
      'ionic://localhost',
      'http://192.168.1.1',
      'http://10.0.2.2' // Android emulator
    ];
    
    // More flexible origin checking for mobile apps
    if (allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || 
      origin?.startsWith('capacitor://') || 
      origin?.startsWith('ionic://') ||
      origin?.includes('localhost') ||
      origin?.startsWith('http://192.168.') ||
      origin?.startsWith('http://10.0.') ||
      origin?.startsWith('https://192.168.') ||
      origin?.startsWith('https://10.0.')
    )) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      // Allow in production for now, you can make this stricter later
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Additional mobile-friendly headers
app.use((req, res, next) => {
  // Set headers for mobile compatibility
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Mobile-optimized file upload middleware
app.use(fileUpload({
  limits: { 
    fileSize: process.env.NODE_ENV === 'production' ? 25 * 1024 * 1024 : 50 * 1024 * 1024 // 25MB for production/mobile, 50MB for dev
  },
  abortOnLimit: true,
  useTempFiles: true, // Better for mobile performance
  tempFileDir: '/tmp/',
  debug: process.env.NODE_ENV === 'development' // Enable debug in development
}));

// Stripe webhook middleware - MUST come before express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware with mobile-friendly limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Add request logging for debugging (useful for mobile testing)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No Origin'}`);
  next();
});

// Trust proxy for mobile apps behind load balancers
app.set('trust proxy', 1);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'API is running successfully',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mobileReady: true
  });
});

// Health check endpoint (useful for mobile app connectivity testing)
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cors: 'enabled',
    mobileSupport: 'enabled'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to the API root. Available endpoints: /auth, /resume, /cover-letter, /payment, /admin, /pdf',
    endpoints: [
      '/api/health',
      '/api/auth',
      '/api/resume',
      '/api/cover-letter',
      '/api/payment',
      '/api/admin',
      '/api/pdf'
    ],
    mobileReady: true,
    corsEnabled: true
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/cover-letter', coverLetterRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', pdfRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.originalUrl} not found`,
    availableEndpoints: [
      '/api/health',
      '/api/auth',
      '/api/resume',
      '/api/cover-letter',
      '/api/payment',
      '/api/admin',
      '/api/pdf'
    ]
  });
});

// Global error handling middleware (mobile-friendly)
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  console.error('Request origin:', req.headers.origin);
  console.error('Request method:', req.method);
  console.error('Request path:', req.path);
  
  // Mobile-friendly error response
  const errorResponse = {
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message,
    timestamp: new Date().toISOString(),
    path: req.path
  };
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error = err.stack;
    errorResponse.origin = req.headers.origin;
  }
  
  res.status(err.status || 500).json(errorResponse);
});

// Only start the server if not in Vercel environment
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API URL: http://localhost:${PORT}/api`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS enabled for mobile apps: ✓`);
    console.log(`File upload limit: ${process.env.NODE_ENV === 'production' ? '25MB' : '50MB'}`);
  });
}

// Export the Express app for Vercel - THIS IS CRUCIAL!
module.exports = app;