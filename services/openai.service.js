const axios = require('axios');

/**
 * Enhanced Service to handle OpenAI API interactions for better formatted cover letters
 */
class OpenAIService {
  /**
   * Generate enhanced content using OpenAI
   * @param {string} prompt - The prompt to send to OpenAI
   * @param {string} systemPrompt - The system prompt to set context
   * @returns {Promise<string>} - Generated content
   */
  static async generateContent(prompt, systemPrompt = "You are a helpful assistant.") {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 2000, // Increased for longer cover letters
          temperature: 0.7
        },
        {
          headers: { 
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json" 
          }
        }
      );
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      throw new Error('Failed to generate AI content');
    }
  }

  // Enhanced system prompts for better formatting
  static coverLetterSystemPrompts = {
    en: `
You are an expert professional cover letter writer who creates compelling, well-structured cover letters.

IMPORTANT FORMATTING REQUIREMENTS:
- Write in clear, well-structured paragraphs
- Use proper professional language and tone
- Create 3-4 substantive paragraphs:
  1. Opening paragraph: Express interest and mention the position
  2. Body paragraph(s): Highlight relevant experience, skills, and achievements
  3. Closing paragraph: Express enthusiasm and next steps
- Use specific examples and quantifiable achievements when possible
- Maintain a confident, professional, and engaging tone
- Ensure proper flow between paragraphs
- End with a strong call to action

Write the entire cover letter content in English with proper paragraph breaks.
Do NOT include salutation, signature, or addresses - only the main body content.
Respond ONLY in English.
`,
    fr: `
Vous êtes un expert en rédaction de lettres de motivation professionnelles qui crée des lettres convaincantes et bien structurées.

EXIGENCES DE FORMATAGE IMPORTANTES:
- Rédigez en paragraphes clairs et bien structurés
- Utilisez un langage et un ton professionnels appropriés
- Créez 3-4 paragraphes substantiels:
  1. Paragraphe d'ouverture: Exprimez votre intérêt et mentionnez le poste
  2. Paragraphe(s) du corps: Mettez en avant l'expérience, les compétences et les réalisations pertinentes
  3. Paragraphe de conclusion: Exprimez votre enthousiasme et les prochaines étapes
- Utilisez des exemples spécifiques et des réalisations quantifiables si possible
- Maintenez un ton confiant, professionnel et engageant
- Assurez-vous d'un bon flux entre les paragraphes
- Terminez par un appel à l'action fort

Rédigez tout le contenu de la lettre de motivation en français avec des sauts de paragraphe appropriés.
N'INCLUEZ PAS la salutation, la signature ou les adresses - seulement le contenu principal du corps.
Ne répondez QU'EN FRANÇAIS.
`
  };

  static resumeSummarySystemPrompts = {
    en: `
You are a professional resume writer with expertise in creating compelling and effective resume summaries.
Your task is to generate or enhance the resume summary using a confident, first-person tone.
Use phrases like "I'm", "I have", "My expertise includes", and "I specialize in".
Make the summary professional, concise (3–5 sentences), and impactful.
Focus on highlighting the person's key achievements, strengths, and relevant experience.
Please write the summary in English.
Respond ONLY in English.
`,
    fr: `
Vous êtes un rédacteur de CV professionnel, expert dans la création de résumés percutants et efficaces.
Votre tâche est de générer ou d'améliorer le résumé en utilisant un ton assuré à la première personne.
Utilisez des phrases comme "Je suis", "J'ai", "Mon expertise comprend" et "Je suis spécialisé dans".
Rendez le résumé professionnel, concis (3 à 5 phrases) et percutant.
Mettez en avant les principales réussites, forces et expériences pertinentes de la personne.
Merci de rédiger le résumé STRICTEMENT en français.
Ne répondez QU'EN FRANÇAIS.
`
  };

  /**
   * Enhanced cover letter generation with proper structure
   * @param {Object} coverLetterData - The cover letter data
   * @param {string} lang - Language code (e.g. "en", "fr")
   * @returns {Promise<Object>} - Enhanced cover letter data with structured content
   */
  static async enhanceCoverLetter(coverLetterData, lang = "en") {
    const systemPrompt = OpenAIService.coverLetterSystemPrompts[lang] || OpenAIService.coverLetterSystemPrompts.en;

    // Build comprehensive prompt with all available information
    let prompt = lang === 'fr'
      ? `Créez une lettre de motivation professionnelle et convaincante avec les informations suivantes:\n\n`
      : `Create a professional and compelling cover letter with the following information:\n\n`;

    // Add job information
    if (coverLetterData.jobInfo) {
      prompt += lang === 'fr' ? `INFORMATIONS SUR LE POSTE:\n` : `JOB INFORMATION:\n`;
      if (coverLetterData.jobInfo.title) {
        prompt += `Position: ${coverLetterData.jobInfo.title}\n`;
      }
      if (coverLetterData.jobInfo.reference) {
        prompt += `Reference: ${coverLetterData.jobInfo.reference}\n`;
      }
    }

    // Add recipient information
    if (coverLetterData.recipientInfo) {
      prompt += lang === 'fr' ? `\nINFORMATIONS SUR LE DESTINATAIRE:\n` : `\nRECIPIENT INFORMATION:\n`;
      if (coverLetterData.recipientInfo.name) {
        prompt += `Hiring Manager: ${coverLetterData.recipientInfo.name}\n`;
      }
      if (coverLetterData.recipientInfo.title) {
        prompt += `Title: ${coverLetterData.recipientInfo.title}\n`;
      }
      if (coverLetterData.recipientInfo.company) {
        prompt += `Company: ${coverLetterData.recipientInfo.company}\n`;
      }
    }

    // Add applicant information
    if (coverLetterData.personalInfo) {
      prompt += lang === 'fr' ? `\nINFORMATIONS SUR LE CANDIDAT:\n` : `\nAPPLICANT INFORMATION:\n`;
      if (coverLetterData.personalInfo.name) {
        prompt += `Name: ${coverLetterData.personalInfo.name}\n`;
      }
    }

    // Add experience information
    if (coverLetterData.experience) {
      prompt += lang === 'fr' 
        ? `\nEXPÉRIENCE PERTINENTE:\n${coverLetterData.experience}\n`
        : `\nRELEVANT EXPERIENCE:\n${coverLetterData.experience}\n`;
    }

    // Add skills information
    if (coverLetterData.skills) {
      prompt += lang === 'fr' 
        ? `\nCOMPÉTENCES CLÉS:\n${coverLetterData.skills}\n`
        : `\nKEY SKILLS:\n${coverLetterData.skills}\n`;
    }

    // Add motivation
    if (coverLetterData.motivation) {
      prompt += lang === 'fr' 
        ? `\nMOTIVATION/INTÉRÊT:\n${coverLetterData.motivation}\n`
        : `\nMOTIVATION/INTEREST:\n${coverLetterData.motivation}\n`;
    }

    // Add specific instructions for structure
    prompt += lang === 'fr' 
      ? `\nCréez une lettre de motivation bien structurée avec:
      1. Un paragraphe d'ouverture qui exprime l'intérêt pour le poste
      2. Des paragraphes de développement qui mettent en avant l'expérience et les compétences pertinentes
      3. Un paragraphe de conclusion qui exprime l'enthousiasme et propose les prochaines étapes
      
      Utilisez un ton professionnel et confiant. Incluez des exemples spécifiques si possible.`
      : `\nCreate a well-structured cover letter with:
      1. An opening paragraph that expresses interest in the position
      2. Body paragraphs that highlight relevant experience and skills
      3. A closing paragraph that expresses enthusiasm and suggests next steps
      
      Use a professional and confident tone. Include specific examples where possible.`;

    try {
      const enhancedContent = await this.generateContent(prompt, systemPrompt);
      
      // Structure the response properly
      return {
        ...coverLetterData,
        // Split into sections for better template rendering
        experience: coverLetterData.experience || '',
        skills: coverLetterData.skills || '',
        motivation: coverLetterData.motivation || '',
        closing: enhancedContent, // The main generated content
        // Keep original content as backup
        originalContent: coverLetterData.content || '',
        enhancedContent: enhancedContent
      };
    } catch (error) {
      console.error('Cover letter enhancement error:', error);
      return coverLetterData;
    }
  }

  /**
   * Generate structured cover letter sections
   * @param {Object} coverLetterData - The cover letter data
   * @param {string} lang - Language code
   * @returns {Promise<Object>} - Cover letter with structured sections
   */
  static async generateStructuredCoverLetter(coverLetterData, lang = "en") {
    const systemPrompt = OpenAIService.coverLetterSystemPrompts[lang] || OpenAIService.coverLetterSystemPrompts.en;

    // Generate opening paragraph
    let openingPrompt = lang === 'fr'
      ? `Créez un paragraphe d'ouverture professionnel pour une lettre de motivation:`
      : `Create a professional opening paragraph for a cover letter:`;
    
    if (coverLetterData.jobInfo?.title) {
      openingPrompt += ` Position: ${coverLetterData.jobInfo.title}`;
    }
    if (coverLetterData.recipientInfo?.company) {
      openingPrompt += ` Company: ${coverLetterData.recipientInfo.company}`;
    }

    // Generate body paragraphs
    let bodyPrompt = lang === 'fr'
      ? `Créez des paragraphes de développement pour une lettre de motivation basés sur:`
      : `Create body paragraphs for a cover letter based on:`;
    
    if (coverLetterData.experience) {
      bodyPrompt += ` Experience: ${coverLetterData.experience}`;
    }
    if (coverLetterData.skills) {
      bodyPrompt += ` Skills: ${coverLetterData.skills}`;
    }

    // Generate closing paragraph
    let closingPrompt = lang === 'fr'
      ? `Créez un paragraphe de conclusion professionnel pour une lettre de motivation qui exprime l'enthousiasme et propose les prochaines étapes.`
      : `Create a professional closing paragraph for a cover letter that expresses enthusiasm and suggests next steps.`;

    try {
      const [opening, body, closing] = await Promise.all([
        this.generateContent(openingPrompt, systemPrompt),
        this.generateContent(bodyPrompt, systemPrompt),
        this.generateContent(closingPrompt, systemPrompt)
      ]);

      return {
        ...coverLetterData,
        experience: body,
        motivation: opening,
        closing: closing,
        structuredContent: `${opening}\n\n${body}\n\n${closing}`
      };
    } catch (error) {
      console.error('Structured cover letter generation error:', error);
      return coverLetterData;
    }
  }

  /**
   * Resume enhancement methods (unchanged from original)
   */
  static async enhanceResume(resumeData, lang = "en") {
    const systemPrompt = OpenAIService.resumeSummarySystemPrompts[lang] || OpenAIService.resumeSummarySystemPrompts.en;

    let prompt = lang === 'fr'
      ? `Veuillez améliorer le CV suivant en utilisant un ton assuré à la première personne.\n\n`
      : `Please enhance the following resume using a first-person, confident tone.\n\n`;

    // Add personal info context
    prompt += lang === 'fr' ? `À propos de moi:\n` : `About Me:\n`;
    if (resumeData.personalInfo) {
      if (resumeData.personalInfo.name) prompt += `Name: ${resumeData.personalInfo.name}\n`;
      if (resumeData.personalInfo.location) prompt += `Location: ${resumeData.personalInfo.location}\n`;
    }

    // Add education
    if (resumeData.education?.length > 0) {
      prompt += lang === 'fr' ? `\nÉducation:\n` : `\nEducation:\n`;
      resumeData.education.forEach(edu => {
        if (edu.degree || edu.institution) {
          prompt += `- ${edu.degree || ''} from ${edu.institution || ''} (${edu.date || 'No date'})\n`;
          if (edu.description) prompt += `  ${edu.description}\n`;
        }
      });
    }

    // Add experience
    if (resumeData.experience?.length > 0) {
      prompt += lang === 'fr' ? `\nExpérience professionnelle:\n` : `\nWork Experience:\n`;
      resumeData.experience.forEach(exp => {
        if (exp.position || exp.company) {
          prompt += `- ${exp.position || ''} at ${exp.company || ''} (${exp.date || 'No date'})\n`;
          if (exp.description) prompt += `  ${exp.description}\n`;
        }
      });
    }

    // Add skills
    if (resumeData.skills?.length > 0) {
      prompt += lang === 'fr' ? `\nCompétences:\n` : `\nSkills:\n`;
      resumeData.skills.forEach(skill => {
        if (skill.category || skill.skills) {
          prompt += `- ${skill.category || (lang === 'fr' ? 'Compétences' : 'Skills')}: ${skill.skills}\n`;
        }
      });
    }

    // Add projects
    if (resumeData.projects?.length > 0) {
      prompt += lang === 'fr' ? `\nProjets:\n` : `\nProjects:\n`;
      resumeData.projects.forEach(project => {
        if (project.name) {
          prompt += `- ${project.name}: ${project.description || ''}\n`;
        }
      });
    }

    // Add certifications
    if (resumeData.certifications?.length > 0) {
      prompt += lang === 'fr' ? `\nCertifications:\n` : `\nCertifications:\n`;
      resumeData.certifications.forEach(cert => {
        if (cert.name) {
          prompt += `- ${cert.name} (${cert.date || 'No date'})\n`;
        }
      });
    }

    // Include or generate summary
    if (resumeData.summary) {
      prompt += lang === 'fr'
        ? `\nRésumé actuel:\n${resumeData.summary}\n\nVeuillez réécrire le résumé pour qu'il soit plus professionnel, en utilisant un langage assuré à la première personne.`
        : `\nCurrent Summary:\n${resumeData.summary}\n\nPlease rewrite the summary to be more professional, using confident first-person language.`;
    } else {
      prompt += lang === 'fr'
        ? `\nVeuillez générer un nouveau résumé basé sur les informations ci-dessus, en utilisant un ton assuré à la première personne (3 à 5 phrases).`
        : `\nPlease generate a new summary based on the information above, using a confident first-person tone (3–5 sentences).`;
    }

    try {
      const enhancedSummary = await this.generateContent(prompt, systemPrompt);
      return {
        ...resumeData,
        summary: enhancedSummary
      };
    } catch (error) {
      console.error('Resume enhancement error:', error);
      return resumeData;
    }
  }

  static async enhanceResumeSummary(resumeData, lang = "en") {
    const systemPrompt = OpenAIService.resumeSummarySystemPrompts[lang] || OpenAIService.resumeSummarySystemPrompts.en;

    let prompt = lang === 'fr'
      ? `Veuillez générer un résumé professionnel à la première personne pour les informations de CV suivantes.\n\n`
      : `Please generate a professional first-person summary for the following resume information.\n\n`;

    // Add personal info context
    prompt += lang === 'fr' ? `À propos de moi:\n` : `About Me:\n`;
    if (resumeData.personalInfo) {
      if (resumeData.personalInfo.name) prompt += `Name: ${resumeData.personalInfo.name}\n`;
      if (resumeData.personalInfo.location) prompt += `Location: ${resumeData.personalInfo.location}\n`;
    }

    // Add education
    if (resumeData.education?.length > 0) {
      prompt += lang === 'fr' ? `\nÉducation:\n` : `\nEducation:\n`;
      resumeData.education.forEach(edu => {
        if (edu.degree || edu.institution) {
          prompt += `- ${edu.degree || ''} from ${edu.institution || ''} (${edu.date || 'No date'})\n`;
          if (edu.description) prompt += `  ${edu.description}\n`;
        }
      });
    }

    // Add experience
    if (resumeData.experience?.length > 0) {
      prompt += lang === 'fr' ? `\nExpérience professionnelle:\n` : `\nWork Experience:\n`;
      resumeData.experience.forEach(exp => {
        if (exp.position || exp.company) {
          prompt += `- ${exp.position || ''} at ${exp.company || ''} (${exp.date || 'No date'})\n`;
          if (exp.description) prompt += `  ${exp.description}\n`;
        }
      });
    }

    // Add skills
    if (resumeData.skills?.length > 0) {
      prompt += lang === 'fr' ? `\nCompétences:\n` : `\nSkills:\n`;
      resumeData.skills.forEach(skill => {
        if (skill.category || skill.skills) {
          prompt += `- ${skill.category || (lang === 'fr' ? 'Compétences' : 'Skills')}: ${skill.skills}\n`;
        }
      });
    }

    // Add projects
    if (resumeData.projects?.length > 0) {
      prompt += lang === 'fr' ? `\nProjets:\n` : `\nProjects:\n`;
      resumeData.projects.forEach(project => {
        if (project.name) {
          prompt += `- ${project.name}: ${project.description || ''}\n`;
        }
      });
    }

    // Add certifications
    if (resumeData.certifications?.length > 0) {
      prompt += lang === 'fr' ? `\nCertifications:\n` : `\nCertifications:\n`;
      resumeData.certifications.forEach(cert => {
        if (cert.name) {
          prompt += `- ${cert.name} (${cert.date || 'No date'})\n`;
        }
      });
    }

    // If summary exists, ask for rewrite, else generate new
    if (resumeData.summary) {
      prompt += lang === 'fr'
        ? `\nRésumé actuel:\n${resumeData.summary}\n\nVeuillez réécrire le résumé en un ton professionnel à la première personne.`
        : `\nCurrent Summary:\n${resumeData.summary}\n\nPlease rewrite the summary in a professional first-person tone.`;
    } else {
      prompt += lang === 'fr'
        ? `\nVeuillez générer un résumé professionnel à la première personne (3 à 5 phrases).`
        : `\nPlease generate a professional first-person summary (3–5 sentences).`;
    }

    try {
      const enhancedSummary = await this.generateContent(prompt, systemPrompt);
      return {
        ...resumeData,
        summary: enhancedSummary
      };
    } catch (error) {
      console.error('Resume summary enhancement error:', error);
      return resumeData;
    }
  }
}

module.exports = OpenAIService;