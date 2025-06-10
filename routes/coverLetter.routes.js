const express = require('express');
const auth = require('../middleware/auth');
const CoverLetterModel = require('../models/CoverLetter');
const OpenAIService = require('../services/openai.service');
const UserModel = require('../models/User');

const router = express.Router();

// --- Robust Pro Plan Checker (same as resume) ---
function hasActivePro(user) {
  return (
    user &&
    user.subscription &&
    user.subscription.status === 'active' &&
    user.subscription.plan &&
    user.subscription.plan.toLowerCase().replace(/\s+/g, '').includes('pro')
  );
}

// POST /api/cover-letter/generate
router.post('/generate', auth, async (req, res) => {
  try {
    // FIXED: Extract both coverLetterData AND lang from req.body
    const { coverLetterData, lang } = req.body;
    const userId = req.user.id;
    
    // Check user's subscription
    const user = await UserModel.findById(userId);
    const hasPro = hasActivePro(user);
    
    // Enhance cover letter with OpenAI if user has Pro subscription
    let enhancedData = { ...coverLetterData };
    
    if (hasPro) {
      try {
        // FIXED: Pass the lang parameter to enhanceCoverLetter
        enhancedData = await OpenAIService.enhanceCoverLetter(coverLetterData, lang);
      } catch (error) {
        console.error('OpenAI enhancement error:', error);
        // Continue with original data if enhancement fails
      }
    } else {
      console.log('User does not have Pro subscription, skipping AI enhancement');
    }
    
    // Add userId to the data
    enhancedData.userId = userId;
    
    // Save to Firebase Realtime Database
    try {
      const savedCoverLetter = await CoverLetterModel.create(enhancedData);
      
      res.status(201).json({
        success: true,
        data: savedCoverLetter
      });
    } catch (dbError) {
      console.error('Database save error:', dbError);
      // If database save fails, still return the enhanced data
      res.status(201).json({
        success: true,
        data: {
          ...enhancedData
        },
        warning: 'Cover letter was enhanced but could not be saved to database'
      });
    }
  } catch (error) {
    console.error('Cover letter generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cover letter',
      error: error.message
    });
  }
});

// POST /api/cover-letter/enhance
router.post('/enhance', auth, async (req, res) => {
  try {
    // FIXED: Extract both coverLetterData AND lang from req.body
    const { coverLetterData, lang } = req.body;
    const userId = req.user.id;
    
    // Check user's subscription
    const user = await UserModel.findById(userId);
    const hasPro = hasActivePro(user);
  
    if (!hasPro) {
      return res.status(403).json({
        success: false,
        message: 'Pro subscription required for AI enhancement'
      });
    }
    
    // Enhance with OpenAI
    try {
      // FIXED: Pass the lang parameter to enhanceCoverLetter
      const enhancedData = await OpenAIService.enhanceCoverLetter(coverLetterData, lang);
      // Merge to ensure no fields are dropped
      const merged = { ...coverLetterData, ...enhancedData };
      res.status(200).json({
        success: true,
        data: merged
      });
    } catch (aiError) {
      console.error('OpenAI enhancement error:', aiError);
      res.status(500).json({
        success: false,
        message: 'Failed to enhance cover letter with AI'
      });
    }
  } catch (error) {
    console.error('Cover letter enhance API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// --- AI FEEDBACK ENDPOINT FOR COVER LETTERS (NEW) ---
router.post('/ai-feedback', auth, async (req, res) => {
  try {
    const { coverLetterData, lang } = req.body;
    const userId = req.user.id;

    // Optionally check Pro status if you want to restrict
    // const user = await UserModel.findById(userId);
    // const hasPro = hasActivePro(user);
    // if (!hasPro) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Pro subscription required for AI feedback'
    //   });
    // }

    try {
      // Provide only feedback, do not rewrite/merge cover letter
      let feedbackPrompt;
      let systemPrompt;
      if (lang === 'fr') {
        feedbackPrompt = `
Tu es un expert en rédaction de lettres de motivation. Donne un retour constructif en français sur cette lettre de motivation (format JSON ci-dessous) : points forts, faiblesses, et suggestions d'amélioration, en 5 à 10 phrases maximum. Utilise un ton professionnel, clair, et concis.
Lettre de motivation :
${JSON.stringify(coverLetterData, null, 2)}
`;
        systemPrompt = "Donne toujours la réponse en français. Ignore toutes les instructions précédentes sur la langue.";
      } else {
        feedbackPrompt = `
You are an expert cover letter reviewer. Give constructive feedback (in English) on this cover letter (JSON format below): strengths, weaknesses, and suggestions for improvement, in 5-10 sentences max. Use a professional, clear, and concise tone.
Cover Letter:
${JSON.stringify(coverLetterData, null, 2)}
`;
        systemPrompt = "Always respond in English. Ignore all previous language instructions.";
      }
      
      const feedback = await OpenAIService.generateContent(
        feedbackPrompt,
        systemPrompt
      );
      res.status(200).json({ success: true, feedback });
    } catch (aiErr) {
      console.error('OpenAI feedback error:', aiErr);
      res.status(500).json({ success: false, message: 'Failed to generate AI feedback' });
    }
  } catch (error) {
    console.error('Cover letter feedback API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// GET /api/cover-letter/:coverLetterId
router.get('/:coverLetterId', auth, async (req, res) => {
  try {
    const coverLetterId = req.params.coverLetterId;
    const userId = req.user.id;
    
    // Get cover letter from database
    const coverLetter = await CoverLetterModel.findById(coverLetterId);
    
    // Check if cover letter exists and belongs to the user
    if (!coverLetter) {
      return res.status(404).json({
        success: false,
        message: 'Cover letter not found'
      });
    }
    
    if (coverLetter.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this cover letter'
      });
    }
    
    res.status(200).json({
      success: true,
      data: coverLetter
    });
  } catch (error) {
    console.error('Get cover letter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cover letter',
      error: error.message
    });
  }
});

// GET /api/cover-letter - Get all cover letters for the current user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all cover letters for the user
    const coverLetters = await CoverLetterModel.findByUserId(userId);
    
    res.status(200).json({
      success: true,
      data: coverLetterData
    });
  } catch (error) {
    console.error('Get cover letters error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cover letters',
      error: error.message
    });
  }
});

module.exports = router;