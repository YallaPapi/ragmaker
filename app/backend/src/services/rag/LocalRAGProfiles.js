const fs = require('fs').promises;
const path = require('path');

// RAG Profile System for Local Desktop Application
class LocalRAGProfiles {
  constructor(customProfilesPath = null) {
    this.customProfilesPath = customProfilesPath || path.join(__dirname, '../../../data/custom_profiles.json');
    
    this.profiles = {
      // Default profile with enhanced formatting
      default: {
        name: 'Default Assistant',
        systemPrompt: `You are an expert assistant that analyzes YouTube video transcripts to provide detailed, specific answers with excellent formatting and readability.

CRITICAL INSTRUCTIONS:
1. **BE EXTREMELY SPECIFIC** - Use exact details, examples, numbers, names, and quotes from the videos
2. **PROVIDE COMPREHENSIVE CONTEXT** - Don't just answer the question, explain the full situation around it  
3. **EXTRACT NUANCED INSIGHTS** - Look for subtle points, implications, and deeper meaning in the content
4. **USE MULTIPLE SOURCES** - When available, compare and contrast information from different videos
5. **QUOTE DIRECTLY** - Include actual quotes and specific examples from the creators

DETAILED RESPONSE STRUCTURE:
- **Start with direct answer** with **key conclusion bolded**
- **Use section headings** (## Main Topic) to break up different sections
- **Each section** should have multiple short paragraphs (2-3 sentences each)
- **Section examples**: ## Key Finding, ## Context, ## Examples, ## Implications, ## Sources
- **Each main point gets its own paragraph** - never combine multiple ideas
- Always **bold the video titles** and __underline main conclusions__
- **End with ## Sources** section listing video citations

ADVANCED FORMATTING EXAMPLES:
- **Key concepts** should be bolded throughout
- __Critical conclusions__ should be underlined  
- *Video titles* and creator names in italics
- Use backticks for specific numbers, timestamps, or technical terms
- Break every major idea into **separate short paragraphs**
- **Never write paragraphs longer than 60 words**

AVOID:
- Generic advice or common knowledge
- Vague generalizations  
- Surface-level summaries
- Walls of unformatted text
- Ignoring specific details mentioned in videos

If the context doesn't contain enough specific information, say so explicitly and explain what's missing.`,
        temperature: 0.6,
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
      
      // Simple language profile for accessibility
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
      
      // Developer-focused profile
      developer: {
        name: 'Developer Focus',
        systemPrompt: `You are a software developer analyzing technical YouTube content.
Focus specifically on: code examples, programming concepts, tools, frameworks, APIs, and development practices.
Extract: code snippets, command examples, configuration details, debugging tips.
Ignore: non-technical content unless it relates to development workflow.
Structure responses with clear headings for different technical topics.
Always mention specific tools, versions, and commands when available.`,
        temperature: 0.4,
        focus: ['code', 'programming', 'tools', 'frameworks', 'development', 'debugging'],
        tone: 'technical'
      },
      
      // Business analysis profile
      business: {
        name: 'Business Analyst',
        systemPrompt: `You are a business analyst extracting strategic insights from YouTube content.
Focus on: market trends, business models, revenue strategies, competitive analysis, growth metrics.
Extract: financial data, market size, user numbers, business partnerships, strategic decisions.
Ignore: technical implementation details unless they impact business outcomes.
Present findings with clear business implications and actionable insights.`,
        temperature: 0.5,
        focus: ['business strategy', 'market analysis', 'revenue', 'growth', 'competition'],
        tone: 'professional'
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
    try {
      // Ensure the directory exists
      const customDir = path.dirname(this.customProfilesPath);
      await fs.mkdir(customDir, { recursive: true });
      
      const data = await fs.readFile(this.customProfilesPath, 'utf8');
      const customProfiles = JSON.parse(data);
      
      // Merge custom profiles with defaults
      this.profiles = { ...this.profiles, ...customProfiles };
      console.log(`Loaded \${Object.keys(customProfiles).length} custom profiles`);
    } catch (error) {
      // No custom profiles file yet, or error reading it
      console.log('No custom profiles found, using defaults only');
    }
  }
  
  async saveCustomProfile(id, profile) {
    try {
      // Ensure directory exists
      const customDir = path.dirname(this.customProfilesPath);
      await fs.mkdir(customDir, { recursive: true });
      
      let customProfiles = {};
      try {
        const data = await fs.readFile(this.customProfilesPath, 'utf8');
        customProfiles = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet, start with empty object
      }
      
      // Add/update the profile
      customProfiles[id] = profile;
      await fs.writeFile(this.customProfilesPath, JSON.stringify(customProfiles, null, 2));
      
      // Update in memory
      this.profiles[id] = profile;
      
      console.log(`Saved custom profile: \${id}`);
      return true;
    } catch (error) {
      console.error('Error saving custom profile:', error);
      return false;
    }
  }
  
  async deleteCustomProfile(id) {
    if (this.isDefaultProfile(id)) {
      throw new Error('Cannot delete default profiles');
    }
    
    try {
      let customProfiles = {};
      try {
        const data = await fs.readFile(this.customProfilesPath, 'utf8');
        customProfiles = JSON.parse(data);
      } catch (e) {
        // No custom profiles file
        return false;
      }
      
      delete customProfiles[id];
      await fs.writeFile(this.customProfilesPath, JSON.stringify(customProfiles, null, 2));
      
      // Remove from memory
      delete this.profiles[id];
      
      console.log(`Deleted custom profile: \${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting custom profile:', error);
      return false;
    }
  }
  
  isDefaultProfile(profileId) {
    const defaultProfiles = [
      'default', 'technical', 'casual', 'research', 'news', 
      'tutorial', 'simple', 'developer', 'business', 'custom'
    ];
    return defaultProfiles.includes(profileId);
  }
  
  getProfile(profileId) {
    return this.profiles[profileId] || this.profiles.default;
  }
  
  getAllProfiles() {
    return Object.keys(this.profiles).map(id => ({
      id,
      name: this.profiles[id].name,
      tone: this.profiles[id].tone,
      focus: this.profiles[id].focus,
      isCustom: !this.isDefaultProfile(id)
    }));
  }
  
  getProfilesByCategory() {
    const categories = {
      general: ['default', 'casual'],
      technical: ['technical', 'developer'],
      educational: ['research', 'tutorial', 'simple'],
      professional: ['business', 'news'],
      custom: []
    };
    
    // Add custom profiles to custom category
    Object.keys(this.profiles).forEach(id => {
      if (!this.isDefaultProfile(id)) {
        categories.custom.push(id);
      }
    });
    
    // Convert to full profile objects
    const result = {};
    Object.keys(categories).forEach(category => {
      result[category] = categories[category].map(id => ({
        id,
        name: this.profiles[id]?.name || id,
        tone: this.profiles[id]?.tone,
        focus: this.profiles[id]?.focus
      })).filter(p => this.profiles[p.id]); // Only include existing profiles
    });
    
    return result;
  }
  
  // Build enhanced prompt based on profile and user question
  buildPrompt(profileId, context, question, customInstructions = null) {
    const profile = this.getProfile(profileId);
    
    let enhancedPrompt = profile.systemPrompt;
    
    // If custom profile, append user's custom instructions
    if (profileId === 'custom' && customInstructions) {
      enhancedPrompt += `\n\nUser's custom instructions:\n\${customInstructions}`;
    }
    
    enhancedPrompt += '\n\n';
    
    // Add focus instructions if specified
    if (profile.focus && profile.focus.length > 0) {
      enhancedPrompt += `Focus specifically on: \${profile.focus.join(', ')}.\n`;
      enhancedPrompt += `Ignore or briefly mention other topics.\n\n`;
    }
    
    // Add enhanced formatting instructions based on tone
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
      case 'technical':
        enhancedPrompt += `Use precise technical terminology. Include code examples and specific implementation details.\n`;
        break;
      case 'professional':
        enhancedPrompt += `Use professional business language. Focus on strategic implications and actionable insights.\n`;
        break;
    }
    
    // Add universal formatting guidelines (except for simple tone)
    if (profile.tone !== 'simple') {
      enhancedPrompt += `\nFormatting requirements:
- **Use section headings** (## Heading) to organize content
- **Break into multiple short paragraphs** (2-3 sentences each)
- **Bold key concepts** and important information
- Use *italics* for emphasis and video titles
- Use bullet points for lists
- Include specific examples and quotes from the content
- End with a ## Sources section if multiple videos are referenced\n\n`;
    }
    
    return {
      systemPrompt: enhancedPrompt,
      userPrompt: `Context from YouTube videos:\n\${context}\n\nQuestion: \${question}\n\nProvide your response according to the specified focus and tone.`,
      temperature: profile.temperature
    };
  }
  
  // Validate profile structure
  validateProfile(profile) {
    const requiredFields = ['name', 'systemPrompt', 'temperature', 'tone'];
    const errors = [];
    
    requiredFields.forEach(field => {
      if (!(field in profile)) {
        errors.push(`Missing required field: \${field}`);
      }
    });
    
    if (profile.temperature && (profile.temperature < 0 || profile.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }
    
    if (profile.focus && !Array.isArray(profile.focus)) {
      errors.push('Focus must be an array');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
  
  // Export profiles for backup
  async exportProfiles() {
    return {
      timestamp: new Date().toISOString(),
      profiles: this.profiles
    };
  }
  
  // Import profiles from backup
  async importProfiles(data, mergeMode = false) {
    if (!data.profiles) {
      throw new Error('Invalid profile export format');
    }
    
    if (mergeMode) {
      // Merge with existing profiles
      this.profiles = { ...this.profiles, ...data.profiles };
    } else {
      // Replace all profiles (keep defaults)
      const defaults = ['default', 'technical', 'casual', 'research', 'news', 'tutorial', 'simple', 'developer', 'business', 'custom'];
      const newProfiles = {};
      
      // Keep default profiles
      defaults.forEach(id => {
        if (this.profiles[id]) {
          newProfiles[id] = this.profiles[id];
        }
      });
      
      // Add imported profiles
      Object.keys(data.profiles).forEach(id => {
        newProfiles[id] = data.profiles[id];
      });
      
      this.profiles = newProfiles;
    }
    
    // Save custom profiles (non-defaults) to file
    const customProfiles = {};
    Object.keys(this.profiles).forEach(id => {
      if (!this.isDefaultProfile(id)) {
        customProfiles[id] = this.profiles[id];
      }
    });
    
    if (Object.keys(customProfiles).length > 0) {
      await fs.writeFile(this.customProfilesPath, JSON.stringify(customProfiles, null, 2));
    }
    
    return {
      imported: Object.keys(data.profiles).length,
      total: Object.keys(this.profiles).length
    };
  }
}

module.exports = LocalRAGProfiles;