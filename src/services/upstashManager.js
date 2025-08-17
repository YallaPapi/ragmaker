const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class UpstashManager {
  constructor() {
    this.projectsFile = path.join(__dirname, '../../data/projects.json');
    this.projects = {};
    this.currentProject = null;
    this.initialized = this.loadProjects();
    
    // Upstash management API endpoint
    this.apiUrl = 'https://api.upstash.com/v2/vector';
    this.email = process.env.UPSTASH_EMAIL;
    this.apiKey = process.env.UPSTASH_MANAGEMENT_KEY;
  }

  async loadProjects() {
    try {
      const data = await fs.readFile(this.projectsFile, 'utf8');
      const parsed = JSON.parse(data);
      this.projects = parsed.projects || {};
      this.currentProject = parsed.currentProject || null;
    } catch (error) {
      // File doesn't exist yet
      this.projects = {};
      this.currentProject = null;
      await this.saveProjects();
    }
  }

  async saveProjects() {
    const dir = path.dirname(this.projectsFile);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.projectsFile, JSON.stringify({
        projects: this.projects,
        currentProject: this.currentProject
      }, null, 2));
    } catch (error) {
      console.error('Error saving projects:', error);
    }
  }

  async createProject(projectName, description = '') {
    // Check if we have API credentials
    if (!this.email || !this.apiKey) {
      // If no Upstash management API, create a local namespace in existing DB
      const projectId = `project_${Date.now()}`;
      const project = {
        id: projectId,
        name: projectName,
        description,
        type: 'namespace', // Using namespaces in single DB
        createdAt: new Date().toISOString(),
        stats: {
          vectorCount: 0,
          channels: []
        }
      };
      
      this.projects[projectId] = project;
      this.currentProject = projectId;
      await this.saveProjects();
      
      return project;
    }
    
    // Create new Upstash vector index via API
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          name: projectName.toLowerCase().replace(/\s+/g, '-'),
          region: 'us-east-1',
          dimension: 1536,
          similarity_function: 'COSINE'
        },
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const project = {
        id: response.data.id,
        name: projectName,
        description,
        type: 'database',
        endpoint: response.data.endpoint,
        token: response.data.token,
        createdAt: new Date().toISOString(),
        stats: {
          vectorCount: 0,
          channels: []
        }
      };
      
      this.projects[project.id] = project;
      this.currentProject = project.id;
      await this.saveProjects();
      
      return project;
    } catch (error) {
      console.error('Error creating Upstash database:', error.response?.data || error.message);
      throw new Error('Failed to create new vector database');
    }
  }

  async deleteProject(projectId) {
    const project = this.projects[projectId];
    if (!project) return false;
    
    if (project.type === 'database' && this.apiKey) {
      // Delete from Upstash
      try {
        await axios.delete(
          `${this.apiUrl}/${project.id}`,
          {
            headers: {
              'Authorization': `Basic ${Buffer.from(`${this.email}:${this.apiKey}`).toString('base64')}`
            }
          }
        );
      } catch (error) {
        console.error('Error deleting Upstash database:', error);
      }
    }
    
    delete this.projects[projectId];
    if (this.currentProject === projectId) {
      this.currentProject = null;
    }
    await this.saveProjects();
    return true;
  }

  async switchProject(projectId) {
    if (!this.projects[projectId]) {
      throw new Error('Project not found');
    }
    
    this.currentProject = projectId;
    await this.saveProjects();
    
    // Update environment for current session
    const project = this.projects[projectId];
    if (project.type === 'database') {
      process.env.UPSTASH_VECTOR_REST_URL = project.endpoint;
      process.env.UPSTASH_VECTOR_REST_TOKEN = project.token;
    }
    
    return project;
  }

  getCurrentProject() {
    if (!this.currentProject) return null;
    return this.projects[this.currentProject];
  }

  getAllProjects() {
    return this.projects;
  }

  getProjectCredentials(projectId) {
    const project = this.projects[projectId || this.currentProject];
    if (!project) return null;
    
    if (project.type === 'namespace') {
      // Use existing credentials with namespace prefix
      return {
        url: process.env.UPSTASH_VECTOR_REST_URL,
        token: process.env.UPSTASH_VECTOR_REST_TOKEN,
        namespace: project.id
      };
    }
    
    return {
      url: project.endpoint,
      token: project.token,
      namespace: ''
    };
  }
}

module.exports = UpstashManager;