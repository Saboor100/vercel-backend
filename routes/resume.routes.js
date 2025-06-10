const express = require('express');
const auth = require('../middleware/auth');
const ResumeModel = require('../models/Resume');
const OpenAIService = require('../services/openai.service');
const UserModel = require('../models/User');

const router = express.Router();

// --- Robust Pro Plan Checker ---
function hasActivePro(user) {
  return (
    user &&
    user.subscription &&
    user.subscription.status === 'active' &&
    user.subscription.plan &&
    user.subscription.plan.toLowerCase().replace(/\s+/g, '').includes('pro')
  );
}

// POST /api/resume/generate
router.post('/generate', auth, async (req, res) => {
  try {
    const { resumeData, lang } = req.body;
    const userId = req.user.id;

    // Check user's subscription
    const user = await UserModel.findById(userId);
    const hasPro = hasActivePro(user);

    // Enhance resume with OpenAI if user has Pro subscription
    let enhancedData = { ...resumeData };

    if (hasPro) {
      try {
        // Always merge to keep all fields
        const aiResult = await OpenAIService.enhanceResume(resumeData, lang);
        enhancedData = { ...resumeData, ...aiResult };
      } catch (error) {
        console.error('OpenAI enhancement error:', error);
        // Continue with original data if enhancement fails
      }
    } else {
      console.log('User does not have Pro subscription, skipping AI enhancement');
    }

    // Add userId to the data
    enhancedData.userId = userId;

    // Save to database
    const savedResume = await ResumeModel.create(enhancedData);

    res.status(201).json({
      success: true,
      data: savedResume
    });
  } catch (error) {
    console.error('Resume generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate resume',
      error: error.message
    });
  }
});

// POST /api/resume/enhance
router.post('/enhance', auth, async (req, res) => {
  try {
    const { resumeData, lang } = req.body;
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
      const enhancedData = await OpenAIService.enhanceResume(resumeData, lang);
      // Merge to ensure no fields are dropped
      const merged = { ...resumeData, ...enhancedData };
      res.status(200).json({
        success: true,
        data: merged
      });
    } catch (aiError) {
      console.error('OpenAI enhancement error:', aiError);
      res.status(500).json({
        success: false,
        message: 'Failed to enhance resume with AI'
      });
    }
  } catch (error) {
    console.error('Resume enhance API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// POST /api/resume/enhance-summary (supports multilingual)
router.post('/enhance-summary', auth, async (req, res) => {
  try {
    const { resumeData, lang } = req.body;
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

    // Enhance summary with OpenAI (multilingual)
    try {
      const enhancedData = await OpenAIService.enhanceResumeSummary(resumeData, lang);
      // Merge to ensure no fields are dropped
      const merged = { ...resumeData, ...enhancedData };
      res.status(200).json({
        success: true,
        data: merged
      });
    } catch (aiError) {
      console.error('OpenAI summary enhancement error:', aiError);
      res.status(500).json({
        success: false,
        message: 'Failed to enhance summary with AI'
      });
    }
  } catch (error) {
    console.error('Resume enhance-summary API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// --- AI FEEDBACK ENDPOINT FOR MULTILINGUAL RESPONSE ---
router.post('/ai-feedback', auth, async (req, res) => {
  try {
    const { resumeData, lang } = req.body;
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
      // Provide only feedback, do not rewrite/merge resume
      let feedbackPrompt;
      let systemPrompt;
      if (lang === 'fr') {
        feedbackPrompt = `
Tu es un expert en rédaction de CV. Donne un retour constructif en français sur ce CV (format JSON ci-dessous) : points forts, faiblesses, et suggestions d'amélioration, en 5 à 10 phrases maximum. Utilise un ton professionnel, clair, et concis.
CV :
${JSON.stringify(resumeData, null, 2)}
`;
        systemPrompt = "Donne toujours la réponse en français. Ignore toutes les instructions précédentes sur la langue.";
      } else {
        feedbackPrompt = `
You are an expert resume reviewer. Give constructive feedback (in English) on this resume (JSON format below): strengths, weaknesses, and suggestions for improvement, in 5-10 sentences max. Use a professional, clear, and concise tone.
Resume:
${JSON.stringify(resumeData, null, 2)}
`;
        systemPrompt = "Always respond in English. Ignore all previous language instructions.";
      }
      // Use the same method as enhancement, but just get plain text feedback
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
    console.error('Resume feedback API error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// GET /api/resume/:resumeId
router.get('/:resumeId', auth, async (req, res) => {
  try {
    const resumeId = req.params.resumeId;
    const userId = req.user.id;

    // Get resume from database
    const resume = await ResumeModel.findById(resumeId);

    // Check if resume exists and belongs to the user
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    if (resume.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this resume'
      });
    }

    res.status(200).json({
      success: true,
      data: resume
    });
  } catch (error) {
    console.error('Get resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve resume',
      error: error.message
    });
  }
});

// GET /api/resume - Get all resumes for the current user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all resumes for the user
    const resumes = await ResumeModel.findByUserId(userId);

    res.status(200).json({
      success: true,
      data: resumes
    });
  } catch (error) {
    console.error('Get resumes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve resumes',
      error: error.message
    });
  }
});

module.exports = router;