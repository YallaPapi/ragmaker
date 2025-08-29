const express = require('express');
const validation = require('../../utils/validation');
const ErrorHandler = require('../../utils/errorHandler');

const router = express.Router();

// Query the RAG system
router.post('/query', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const question = validation.validateQuery(req.body.question);
  const ragService = req.app.locals.ragService;
  
  if (!ragService) {
    throw ErrorHandler.createErrorResponse('RAG service not initialized', 500);
  }
  
  const response = await ragService.query(question);
  res.json(response);
}));

// Chat endpoint (maintains conversation)
router.post('/chat', ErrorHandler.handleAsyncRoute(async (req, res) => {
  const question = validation.validateQuery(req.body.question);
  const profileId = validation.validateProfileId(req.body.profileId);
  const { messages, customInstructions, projectId } = req.body;
  
  const ragService = req.app.locals.ragService;
  
  if (!ragService) {
    return res.status(500).json({ 
      error: 'RAG service not initialized', 
      debug: {
        question,
        profileId: profileId || 'default',
        chunksCount: 0,
        context: 'ERROR: RAG service not initialized',
        systemPrompt: 'ERROR: Service not available',
        userPrompt: 'ERROR: Service not available',
        error: 'RAG service not initialized'
      }
    });
  }
  
  try {
    // Pass profileId and custom instructions to query method
    const response = await ragService.query(question, 10, profileId || 'default', customInstructions);
    console.log('RAG response includes debug:', !!response.debug);
    console.log('Debug data structure:', response.debug ? Object.keys(response.debug) : 'No debug data');
    
    // Ensure debug object exists in response
    if (!response.debug) {
      response.debug = {
        question,
        profileId: profileId || 'default',
        chunksCount: 0,
        context: 'ERROR: Debug data not generated',
        systemPrompt: 'ERROR: Debug data not generated',
        userPrompt: 'ERROR: Debug data not generated',
        error: 'Debug object missing from RAG response'
      };
    }
    
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat',
      debug: {
        question: question || 'Unknown',
        profileId: profileId || 'default',
        chunksCount: 0,
        context: 'ERROR: Chat processing failed',
        systemPrompt: 'ERROR: Chat processing failed',
        userPrompt: 'ERROR: Chat processing failed',
        error: error.message
      }
    });
  }
}));

module.exports = router;