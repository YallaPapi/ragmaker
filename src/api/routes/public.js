const express = require('express');
const router = express.Router();
const path = require('path');

// Middleware to check if project is public
async function checkPublicAccess(req, res, next) {
  const { projectId } = req.params;
  const channelManager = req.app.locals.channelManager;
  const upstashManager = req.app.locals.upstashManager;
  
  // Check if project exists and is public
  const project = upstashManager.getProjectById(projectId);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  if (!project.isPublic && !req.user) {
    return res.status(403).json({ error: 'This project is private' });
  }
  
  // Attach project to request
  req.project = project;
  next();
}

// Public project listing
router.get('/api/public/projects', async (req, res) => {
  try {
    const upstashManager = req.app.locals.upstashManager;
    const channelManager = req.app.locals.channelManager;
    
    // Get all public projects
    const allProjects = upstashManager.getAllProjects();
    const publicProjects = allProjects.filter(p => p.isPublic);
    
    // Add channel info to each project
    const projectsWithChannels = publicProjects.map(project => {
      const channels = channelManager.getAllChannels(project.id);
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        slug: project.slug || project.id,
        createdAt: project.createdAt,
        stats: {
          channelCount: Object.keys(channels).length,
          totalVideos: Object.values(channels).reduce((sum, ch) => sum + (ch.videoCount || 0), 0),
          totalChunks: Object.values(channels).reduce((sum, ch) => sum + (ch.totalChunks || 0), 0)
        },
        channels: Object.values(channels).map(ch => ({
          name: ch.channelName,
          videoCount: ch.videoCount
        })),
        viewCount: project.viewCount || 0,
        lastActive: project.lastActive || project.createdAt
      };
    });
    
    // Sort by popularity (view count) or recent activity
    const sortBy = req.query.sort || 'popular';
    if (sortBy === 'popular') {
      projectsWithChannels.sort((a, b) => b.viewCount - a.viewCount);
    } else if (sortBy === 'recent') {
      projectsWithChannels.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
    }
    
    res.json(projectsWithChannels);
  } catch (error) {
    console.error('Error fetching public projects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific public project details
router.get('/api/public/project/:projectId', checkPublicAccess, async (req, res) => {
  try {
    const project = req.project;
    const channelManager = req.app.locals.channelManager;
    
    // Increment view count
    if (!project.viewCount) project.viewCount = 0;
    project.viewCount++;
    project.lastActive = new Date().toISOString();
    
    // Get channels for this project
    const channels = channelManager.getAllChannels(project.id);
    
    res.json({
      id: project.id,
      name: project.name,
      description: project.description,
      slug: project.slug || project.id,
      channels: Object.values(channels).map(ch => ({
        id: ch.channelId,
        name: ch.channelName,
        videoCount: ch.videoCount,
        totalChunks: ch.totalChunks,
        indexedAt: ch.indexedAt
      })),
      stats: {
        channelCount: Object.keys(channels).length,
        totalVideos: Object.values(channels).reduce((sum, ch) => sum + (ch.videoCount || 0), 0),
        totalChunks: Object.values(channels).reduce((sum, ch) => sum + (ch.totalChunks || 0), 0)
      },
      viewCount: project.viewCount,
      createdAt: project.createdAt,
      lastActive: project.lastActive
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Public chat endpoint
router.post('/api/public/project/:projectId/chat', checkPublicAccess, async (req, res) => {
  try {
    const { question } = req.body;
    const project = req.project;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Use the RAG service with this project's vector store
    const upstashManager = req.app.locals.upstashManager;
    const vectorStore = req.app.locals.vectorStore;
    const ragService = req.app.locals.ragService;
    
    // Switch to project's vector store
    upstashManager.setCurrentProject(project.id);
    
    // Get answer from RAG
    const result = await ragService.getAnswer(question);
    
    // Track usage
    if (!project.chatCount) project.chatCount = 0;
    project.chatCount++;
    project.lastActive = new Date().toISOString();
    
    res.json({
      ...result,
      projectName: project.name,
      projectId: project.id
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve public chat interface
router.get('/rag/:projectId', checkPublicAccess, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/share.html'));
});

// Serve embed widget
router.get('/rag/:projectId/embed', checkPublicAccess, (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/embed.html'));
});

// Toggle project public/private
router.post('/api/project/:projectId/visibility', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { isPublic, slug } = req.body;
    const upstashManager = req.app.locals.upstashManager;
    
    const project = upstashManager.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Update project visibility
    project.isPublic = isPublic;
    if (slug) {
      // Check if slug is unique
      const existingSlug = upstashManager.getAllProjects().find(p => p.slug === slug && p.id !== projectId);
      if (existingSlug) {
        return res.status(400).json({ error: 'Slug already in use' });
      }
      project.slug = slug;
    }
    
    // Save projects
    await upstashManager.saveProjects();
    
    res.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        isPublic: project.isPublic,
        slug: project.slug,
        shareUrl: project.isPublic ? `/rag/${project.slug || project.id}` : null
      }
    });
  } catch (error) {
    console.error('Error updating project visibility:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;