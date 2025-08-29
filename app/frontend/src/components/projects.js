// Projects Component - RAGMaker Desktop

import apiService from '../services/api.js';
import notificationService from '../services/notification.js';
import { 
    EVENTS, 
    STORAGE_KEYS,
    ERROR_CODES 
} from '../utils/constants.js';
import { 
    generateId, 
    validateProjectName, 
    formatRelativeTime,
    storage
} from '../utils/helpers.js';

class ProjectsComponent {
    constructor() {
        this.projects = [];
        this.currentProject = null;
        this.isLoading = false;
        
        this.elements = {
            container: null,
            projectsList: null,
            createButton: null,
            currentProjectDisplay: null
        };
        
        this.init();
    }
    
    /**
     * Initialize projects component
     */
    init() {
        this.bindElements();
        this.bindEvents();
        this.loadProjects();
        this.loadCurrentProject();
    }
    
    /**
     * Bind DOM elements
     */
    bindElements() {
        this.elements.container = document.getElementById('projects-view');
        // Add more element bindings as needed
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Add event listeners for project management
    }
    
    /**
     * Load projects from API
     */
    async loadProjects() {
        try {
            this.isLoading = true;
            const response = await apiService.getProjects();
            this.projects = response.projects || [];
            this.renderProjects();
        } catch (error) {
            console.error('Failed to load projects:', error);
            notificationService.error('Failed to load projects');
        } finally {
            this.isLoading = false;
        }
    }
    
    /**
     * Load current project
     */
    loadCurrentProject() {
        const savedProject = storage.get(STORAGE_KEYS.CURRENT_PROJECT);
        if (savedProject) {
            this.currentProject = savedProject;
        }
    }
    
    /**
     * Render projects
     */
    renderProjects() {
        // Implementation placeholder
        console.log('Rendering projects:', this.projects);
    }
    
    /**
     * Create new project
     */
    async createProject(projectData) {
        try {
            const validation = validateProjectName(projectData.name);
            if (!validation.valid) {
                notificationService.error(validation.error);
                return;
            }
            
            const response = await apiService.createProject(projectData);
            this.projects.push(response.project);
            this.renderProjects();
            
            notificationService.success('Project created successfully');
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent(EVENTS.PROJECT_CREATED, {
                detail: { project: response.project }
            }));
            
        } catch (error) {
            console.error('Failed to create project:', error);
            notificationService.error('Failed to create project');
        }
    }
    
    /**
     * Switch to project
     */
    async switchProject(projectId) {
        try {
            await apiService.switchProject(projectId);
            const project = this.projects.find(p => p.id === projectId);
            
            if (project) {
                this.currentProject = project;
                storage.set(STORAGE_KEYS.CURRENT_PROJECT, project);
                
                notificationService.success(`Switched to project: ${project.name}`);
                
                // Dispatch event
                window.dispatchEvent(new CustomEvent(EVENTS.PROJECT_SWITCHED, {
                    detail: { project }
                }));
            }
            
        } catch (error) {
            console.error('Failed to switch project:', error);
            notificationService.error('Failed to switch project');
        }
    }
    
    /**
     * Delete project
     */
    async deleteProject(projectId) {
        try {
            await apiService.deleteProject(projectId);
            this.projects = this.projects.filter(p => p.id !== projectId);
            this.renderProjects();
            
            notificationService.success('Project deleted');
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent(EVENTS.PROJECT_DELETED, {
                detail: { projectId }
            }));
            
        } catch (error) {
            console.error('Failed to delete project:', error);
            notificationService.error('Failed to delete project');
        }
    }
    
    /**
     * Get component state
     */
    getState() {
        return {
            projects: this.projects,
            currentProject: this.currentProject,
            isLoading: this.isLoading
        };
    }
    
    /**
     * Destroy component
     */
    destroy() {
        // Cleanup
    }
}

export default ProjectsComponent;