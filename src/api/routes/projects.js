const express = require('express');
const ProjectController = require('../../controllers/projectController');
const ErrorHandler = require('../../utils/errorHandler');

const router = express.Router();

// Initialize controller
const projectController = new ProjectController();

// Middleware to inject services and reinitialize callback
router.use((req, res, next) => {
  const services = {
    upstashManager: req.app.locals.upstashManager
  };
  
  // Create reinitialize callback that updates app locals
  const reinitializeCallback = async () => {
    // This should trigger service reinitialization
    // The actual implementation depends on how ServiceManager is integrated
    const project = services.upstashManager.getCurrentProject();
    
    if (project) {
      const creds = services.upstashManager.getProjectCredentials();
      const VectorStoreService = require('../../services/vectorStore');
      const RAGService = require('../../services/rag');
      
      const vectorStore = new VectorStoreService(creds);
      const ragService = new RAGService(vectorStore);
      
      req.app.locals.vectorStore = vectorStore;
      req.app.locals.ragService = ragService;
    }
  };
  
  projectController.setServices(services, reinitializeCallback);
  next();
});

// Create new project
router.post('/', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await projectController.createProject(req, res);
}));

// Get all projects
router.get('/', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await projectController.getProjects(req, res);
}));

// Switch to project
router.post('/:id/switch', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await projectController.switchProject(req, res);
}));

// Delete project
router.delete('/:id', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await projectController.deleteProject(req, res);
}));

// Update project
router.put('/:id', ErrorHandler.handleAsyncRoute(async (req, res) => {
  await projectController.updateProject(req, res);
}));

module.exports = router;