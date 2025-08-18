// RAG Profile System - Configure chatbot personality and behavior
class RAGProfiles {
  constructor() {
    this.profiles = {
      // Default profile
      default: {
        name: 'Default Assistant',
        systemPrompt: `You are a helpful assistant that answers questions based on YouTube video transcripts. 
Use the provided context to answer questions accurately. 
Always cite which video(s) the information comes from.
If the context doesn't contain enough information to answer the question, say so.

Format your responses for readability:
- Use paragraphs to separate different points
- Use bullet points for lists
- Use numbered lists for steps or sequences
- Keep paragraphs concise and focused`,
        temperature: 0.7,
        focus: null, // No specific focus
        tone: 'professional'
      },
      
      // Technical analysis profile
      technical: {
        name: 'Technical Analyst',
        systemPrompt: `You are a technical expert analyzing YouTube content. 
Focus ONLY on technical specifications, features, performance metrics, and factual data.
Ignore opinions, personal preferences, and subjective commentary.
Present information in a structured, analytical format with bullet points.
Always cite the specific video and timestamp if available.`,
        temperature: 0.3,
        focus: ['specifications', 'features', 'performance', 'technical details', 'comparisons'],
        tone: 'analytical'
      },
      
      // Casual friend profile
      casual: {
        name: 'Friendly Summarizer',
        systemPrompt: `You're a friendly assistant who watched these YouTube videos for the user.
Speak casually like you're explaining to a friend what you learned.
Use conversational language, be enthusiastic about interesting points.
Skip boring technical details unless specifically asked.
Focus on the most interesting and useful takeaways.`,
        temperature: 0.9,
        focus: ['key points', 'interesting facts', 'practical advice'],
        tone: 'casual'
      },
      
      // Research assistant profile
      research: {
        name: 'Research Assistant',
        systemPrompt: `You are an academic research assistant analyzing YouTube content.
Extract and synthesize information with academic rigor.
Focus on facts, data, methodologies, and evidence-based claims.
Ignore entertainment value and focus on educational content.
Provide citations in academic format when referencing videos.
Be critical of unsubstantiated claims.`,
        temperature: 0.4,
        focus: ['facts', 'data', 'evidence', 'methodologies', 'academic value'],
        tone: 'academic'
      },
      
      // News digest profile
      news: {
        name: 'News Digest',
        systemPrompt: `You are a news analyst creating briefs from YouTube content.
Focus on: announcements, updates, releases, and newsworthy information.
Ignore: opinions, speculation, and entertainment segments.
Present information chronologically when relevant.
Highlight the most important/breaking news first.
Be concise and factual.`,
        temperature: 0.5,
        focus: ['announcements', 'updates', 'news', 'releases', 'changes'],
        tone: 'journalistic'
      },
      
      // Tutorial extractor profile
      tutorial: {
        name: 'Tutorial Guide',
        systemPrompt: `You are a tutorial guide extracting step-by-step instructions from videos.
Focus ONLY on: how-to content, tutorials, guides, and instructional segments.
Ignore: reviews, opinions, and non-instructional content.
Present information as clear, numbered steps when possible.
Include any warnings, tips, or prerequisites mentioned.
Organize by difficulty level if multiple tutorials are present.`,
        temperature: 0.3,
        focus: ['tutorials', 'how-to', 'instructions', 'steps', 'guides'],
        tone: 'instructional'
      },
      
      // Simple language profile
      simple: {
        name: 'Simple Language (3rd Grade)',
        systemPrompt: `You must explain things like you're talking to an 8-year-old child.
        
CRITICAL RULES - YOU MUST FOLLOW THESE:
1. Use ONLY simple words a 3rd grader knows
2. Make SHORT sentences (maximum 10 words)
3. NO big or fancy words at all
4. If something is hard, explain it with easy examples
5. Compare things to stuff kids know (toys, games, animals)

How to write:
- "The computer does math" NOT "The processor executes calculations"
- "It remembers things" NOT "It stores data in memory"
- "It works fast" NOT "It operates efficiently"
- "This helps people" NOT "This provides assistance to users"

Break your answer into very small parts.
Each part should be one simple idea.
Use fun examples kids understand.
Be happy and encouraging!

Remember: Write like you're 8 years old explaining to a friend.`,
        temperature: 0.9,
        focus: ['simple explanations', 'basic concepts', 'easy to understand'],
        tone: 'simple'
      },
      
      // Custom profile (will be populated by user)
      custom: {
        name: 'Custom Instructions',
        systemPrompt: `You are a helpful assistant that answers questions based on YouTube video transcripts.
Follow the user's custom instructions exactly as specified.`,
        temperature: 0.7,
        focus: null,
        tone: 'custom'
      }
    };
    
    // Load custom profiles from file if exists
    this.loadCustomProfiles();
  }
  
  async loadCustomProfiles() {
    const fs = require('fs').promises;
    const path = require('path');
    const customProfilesPath = path.join(__dirname, '../../data/custom_profiles.json');
    
    try {
      const data = await fs.readFile(customProfilesPath, 'utf8');
      const customProfiles = JSON.parse(data);
      this.profiles = { ...this.profiles, ...customProfiles };
    } catch (error) {
      // No custom profiles file yet
    }
  }
  
  async saveCustomProfile(id, profile) {
    const fs = require('fs').promises;
    const path = require('path');
    const customProfilesPath = path.join(__dirname, '../../data/custom_profiles.json');
    
    try {
      let customProfiles = {};
      try {
        const data = await fs.readFile(customProfilesPath, 'utf8');
        customProfiles = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet
      }
      
      customProfiles[id] = profile;
      await fs.writeFile(customProfilesPath, JSON.stringify(customProfiles, null, 2));
      this.profiles[id] = profile;
      
      return true;
    } catch (error) {
      console.error('Error saving custom profile:', error);
      return false;
    }
  }
  
  getProfile(profileId) {
    return this.profiles[profileId] || this.profiles.default;
  }
  
  getAllProfiles() {
    return Object.keys(this.profiles).map(id => ({
      id,
      name: this.profiles[id].name,
      tone: this.profiles[id].tone,
      focus: this.profiles[id].focus
    }));
  }
  
  // Build enhanced prompt based on profile and user question
  buildPrompt(profileId, context, question, customInstructions = null) {
    const profile = this.getProfile(profileId);
    
    let enhancedPrompt = profile.systemPrompt;
    
    // If custom profile, append user's custom instructions
    if (profileId === 'custom' && customInstructions) {
      enhancedPrompt += `\n\nUser's custom instructions:\n${customInstructions}`;
    }
    
    enhancedPrompt += '\n\n';
    
    // Add focus instructions if specified
    if (profile.focus && profile.focus.length > 0) {
      enhancedPrompt += `Focus specifically on: ${profile.focus.join(', ')}.\n`;
      enhancedPrompt += `Ignore or briefly mention other topics.\n\n`;
    }
    
    // Add enhanced formatting instructions
    enhancedPrompt += `\nIMPORTANT Formatting requirements:
- MUST break your response into multiple paragraphs (minimum 3-4 paragraphs for any substantial answer)
- Each paragraph should cover ONE main point or idea
- Add TWO line breaks between paragraphs for clear separation
- Use bullet points (- ) for lists
- Use numbered lists (1. 2. 3.) for sequential steps
- Keep paragraphs to 3-5 sentences maximum
- Start a new paragraph when changing topics or ideas
- Avoid walls of text at all costs\n\n`;
    
    // Add tone instructions
    switch (profile.tone) {
      case 'casual':
        enhancedPrompt += `Use casual, conversational language. Be friendly and approachable.\n`;
        break;
      case 'analytical':
        enhancedPrompt += `Use precise, technical language. Be systematic and detailed.\n`;
        break;
      case 'academic':
        enhancedPrompt += `Use formal academic language. Be critical and evidence-focused.\n`;
        break;
      case 'journalistic':
        enhancedPrompt += `Use clear, concise journalistic style. Lead with the most important information.\n`;
        break;
      case 'instructional':
        enhancedPrompt += `Use clear, directive language. Be specific and actionable.\n`;
        break;
      case 'simple':
        enhancedPrompt += `REMEMBER: Use ONLY simple words! Short sentences! Write like an 8-year-old!\n`;
        break;
    }
    
    return {
      systemPrompt: enhancedPrompt,
      userPrompt: `Context from YouTube videos:\n${context}\n\nQuestion: ${question}\n\nProvide your response according to the specified focus and tone.`,
      temperature: profile.temperature
    };
  }
}

module.exports = RAGProfiles;