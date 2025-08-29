const validation = require('../utils/validation');

class ProjectController {
  constructor() {
    this.services = {};
  }

  // Create new project
  async createProject(req, res) {
    try {
      const name = validation.validateProjectName(req.body.name);
      const { description } = req.body;
      
      const { upstashManager } = this.services;
      const project = await upstashManager.createProject(name, description);
      
      // Reinitialize services with new project
      await this.reinitializeServices();
      
      res.json(project);
    } catch (validationError) {
      if (validationError.message.includes('validate')) {
        return res.status(400).json({ error: validationError.message });
      }
      console.error('Error creating project:', validationError);
      res.status(500).json({ error: validationError.message });
    }
  }

  // Get all projects
  async getProjects(req, res) {
    try {
      const { upstashManager } = this.services;
      const projects = upstashManager.getAllProjects();
      const currentProject = upstashManager.getCurrentProject();
      
      res.json({ projects, currentProject });
    } catch (error) {
      console.error('Error getting projects:', error);
      res.status(500).json({ error: 'Failed to get projects' });
    }
  }

  // Switch to different project
  async switchProject(req, res) {
    try {
      const id = validation.validateProjectId(req.params.id);
      
      const { upstashManager } = this.services;
      const project = await upstashManager.switchProject(id);
      
      // Reinitialize services with switched project
      await this.reinitializeServices();
      
      res.json(project);
    } catch (validationError) {
      if (validationError.message.includes('validate')) {
        return res.status(400).json({ error: validationError.message });
      }
      console.error('Error switching project:', validationError);
      res.status(500).json({ error: validationError.message });
    }
  }

  // Delete project
  async deleteProject(req, res) {
    try {
      const id = validation.validateProjectId(req.params.id);
      
      const { upstashManager } = this.services;
      await upstashManager.deleteProject(id);
      
      // Reinitialize services after deletion
      await this.reinitializeServices();
      
      res.json({ success: true });
    } catch (validationError) {
      if (validationError.message.includes('validate')) {
        return res.status(400).json({ error: validationError.message });
      }
      console.error('Error deleting project:', validationError);
      res.status(500).json({ error: validationError.message });
    }
  }

  // Update project
  async updateProject(req, res) {
    try {
      const id = validation.validateProjectId(req.params.id);
      const name = validation.validateProjectName(req.body.name);
      
      const { upstashManager } = this.services;
      await upstashManager.updateProject(id, { name });
      
      res.json({ success: true, name });
    } catch (validationError) {
      if (validationError.message.includes('validate')) {
        return res.status(400).json({ error: validationError.message });
      }
      console.error('Error updating project:', validationError);
      res.status(500).json({ error: validationError.message });
    }
  }

  // Inject services and reinitialize callback
  setServices(services, reinitializeCallback) {
    this.services = services;
    this.reinitializeServices = reinitializeCallback;
  }
}

module.exports = ProjectController;