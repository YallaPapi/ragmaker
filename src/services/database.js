// Database Service - Choose your preferred option

class DatabaseService {
  constructor() {
    this.type = process.env.DB_TYPE || 'file'; // file, postgres, redis, mongodb
    this.initialized = this.initialize();
  }

  async initialize() {
    switch(this.type) {
      case 'postgres':
        return this.initPostgres();
      case 'redis':
        return this.initRedis();
      case 'mongodb':
        return this.initMongoDB();
      default:
        return this.initFileSystem();
    }
  }

  // Option 1: PostgreSQL (Best for production)
  async initPostgres() {
    const { Pool } = require('pg');
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Create tables if not exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        slug VARCHAR(255) UNIQUE,
        is_public BOOLEAN DEFAULT false,
        view_count INTEGER DEFAULT 0,
        chat_count INTEGER DEFAULT 0,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
        channel_id VARCHAR(255) NOT NULL,
        channel_name VARCHAR(255),
        video_count INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        indexed_videos JSONB DEFAULT '[]',
        indexed_at TIMESTAMP DEFAULT NOW(),
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(project_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS chat_logs (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sources JSONB DEFAULT '[]',
        user_ip VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
      CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(is_public);
      CREATE INDEX IF NOT EXISTS idx_channels_project ON channels(project_id);
    `);

    console.log('PostgreSQL database initialized');
  }

  // Option 2: Redis (Simple key-value)
  async initRedis() {
    const { Redis } = require('@upstash/redis');
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN
    });

    console.log('Redis database initialized');
  }

  // Option 3: MongoDB (Good for documents)
  async initMongoDB() {
    const { MongoClient } = require('mongodb');
    this.client = new MongoClient(process.env.MONGODB_URI);
    await this.client.connect();
    this.db = this.client.db('ragmaker');

    // Create indexes
    await this.db.collection('projects').createIndex({ slug: 1 }, { unique: true, sparse: true });
    await this.db.collection('projects').createIndex({ is_public: 1 });
    await this.db.collection('channels').createIndex({ project_id: 1 });

    console.log('MongoDB database initialized');
  }

  // Option 4: File System (Current - works for single server)
  async initFileSystem() {
    const fs = require('fs').promises;
    const path = require('path');
    
    this.dataDir = path.join(__dirname, '../../data');
    await fs.mkdir(this.dataDir, { recursive: true });
    
    console.log('File system database initialized');
  }

  // Universal CRUD operations
  async saveProject(project) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        const { rows } = await this.pool.query(
          `INSERT INTO projects (id, name, description, slug, is_public, settings) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (id) DO UPDATE 
           SET name = $2, description = $3, slug = $4, is_public = $5, settings = $6, updated_at = NOW()
           RETURNING *`,
          [project.id, project.name, project.description, project.slug, project.isPublic, JSON.stringify(project.settings || {})]
        );
        return rows[0];

      case 'redis':
        await this.redis.hset('projects', project.id, JSON.stringify(project));
        if (project.slug) {
          await this.redis.hset('project_slugs', project.slug, project.id);
        }
        return project;

      case 'mongodb':
        await this.db.collection('projects').replaceOne(
          { id: project.id },
          project,
          { upsert: true }
        );
        return project;

      default:
        const fs = require('fs').promises;
        const path = require('path');
        const file = path.join(this.dataDir, 'projects.json');
        
        let data = {};
        try {
          const content = await fs.readFile(file, 'utf8');
          data = JSON.parse(content);
        } catch {}
        
        if (!data.projects) data.projects = {};
        data.projects[project.id] = project;
        
        await fs.writeFile(file, JSON.stringify(data, null, 2));
        return project;
    }
  }

  async getProject(projectId) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        const { rows } = await this.pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
        return rows[0];

      case 'redis':
        const data = await this.redis.hget('projects', projectId);
        return data ? JSON.parse(data) : null;

      case 'mongodb':
        return await this.db.collection('projects').findOne({ id: projectId });

      default:
        const fs = require('fs').promises;
        const path = require('path');
        const file = path.join(this.dataDir, 'projects.json');
        
        try {
          const content = await fs.readFile(file, 'utf8');
          const data = JSON.parse(content);
          return data.projects?.[projectId];
        } catch {
          return null;
        }
    }
  }

  async getProjectBySlug(slug) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        const { rows } = await this.pool.query('SELECT * FROM projects WHERE slug = $1', [slug]);
        return rows[0];

      case 'redis':
        const projectId = await this.redis.hget('project_slugs', slug);
        if (projectId) {
          return this.getProject(projectId);
        }
        return null;

      case 'mongodb':
        return await this.db.collection('projects').findOne({ slug });

      default:
        const projects = await this.getAllProjects();
        return projects.find(p => p.slug === slug);
    }
  }

  async getAllProjects(filters = {}) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        let query = 'SELECT * FROM projects WHERE 1=1';
        const params = [];
        
        if (filters.isPublic !== undefined) {
          params.push(filters.isPublic);
          query += ` AND is_public = $${params.length}`;
        }
        
        query += ' ORDER BY created_at DESC';
        
        const { rows } = await this.pool.query(query, params);
        return rows;

      case 'redis':
        const projects = await this.redis.hgetall('projects');
        const result = Object.values(projects).map(p => JSON.parse(p));
        
        if (filters.isPublic !== undefined) {
          return result.filter(p => p.isPublic === filters.isPublic);
        }
        return result;

      case 'mongodb':
        return await this.db.collection('projects').find(filters).toArray();

      default:
        const fs = require('fs').promises;
        const path = require('path');
        const file = path.join(this.dataDir, 'projects.json');
        
        try {
          const content = await fs.readFile(file, 'utf8');
          const data = JSON.parse(content);
          let projects = Object.values(data.projects || {});
          
          if (filters.isPublic !== undefined) {
            projects = projects.filter(p => p.isPublic === filters.isPublic);
          }
          
          return projects;
        } catch {
          return [];
        }
    }
  }

  async incrementViewCount(projectId) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        await this.pool.query(
          'UPDATE projects SET view_count = view_count + 1 WHERE id = $1',
          [projectId]
        );
        break;

      case 'redis':
        await this.redis.hincrby('project_views', projectId, 1);
        break;

      case 'mongodb':
        await this.db.collection('projects').updateOne(
          { id: projectId },
          { $inc: { view_count: 1 } }
        );
        break;

      default:
        const project = await this.getProject(projectId);
        if (project) {
          project.view_count = (project.view_count || 0) + 1;
          await this.saveProject(project);
        }
    }
  }

  async logChat(projectId, question, answer, sources) {
    await this.initialized;
    
    const chatLog = {
      project_id: projectId,
      question,
      answer,
      sources,
      created_at: new Date()
    };

    switch(this.type) {
      case 'postgres':
        await this.pool.query(
          'INSERT INTO chat_logs (project_id, question, answer, sources) VALUES ($1, $2, $3, $4)',
          [projectId, question, answer, JSON.stringify(sources)]
        );
        break;

      case 'redis':
        const key = `chat_logs:${projectId}`;
        await this.redis.lpush(key, JSON.stringify(chatLog));
        await this.redis.ltrim(key, 0, 999); // Keep last 1000 chats
        break;

      case 'mongodb':
        await this.db.collection('chat_logs').insertOne(chatLog);
        break;

      default:
        // For file system, just increment counter
        const project = await this.getProject(projectId);
        if (project) {
          project.chat_count = (project.chat_count || 0) + 1;
          await this.saveProject(project);
        }
    }
  }

  async saveChannel(channel) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        await this.pool.query(
          `INSERT INTO channels (project_id, channel_id, channel_name, video_count, total_chunks, indexed_videos) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (project_id, channel_id) DO UPDATE 
           SET channel_name = $3, video_count = $4, total_chunks = $5, indexed_videos = $6, last_updated = NOW()`,
          [channel.projectId, channel.channelId, channel.channelName, channel.videoCount, channel.totalChunks, JSON.stringify(channel.indexedVideos || [])]
        );
        break;

      case 'redis':
        const key = `channels:${channel.projectId}`;
        await this.redis.hset(key, channel.channelId, JSON.stringify(channel));
        break;

      case 'mongodb':
        await this.db.collection('channels').replaceOne(
          { projectId: channel.projectId, channelId: channel.channelId },
          channel,
          { upsert: true }
        );
        break;

      default:
        // Use existing channel manager file system
        break;
    }
  }

  async getChannels(projectId) {
    await this.initialized;
    
    switch(this.type) {
      case 'postgres':
        const { rows } = await this.pool.query('SELECT * FROM channels WHERE project_id = $1', [projectId]);
        return rows;

      case 'redis':
        const channels = await this.redis.hgetall(`channels:${projectId}`);
        return Object.values(channels).map(c => JSON.parse(c));

      case 'mongodb':
        return await this.db.collection('channels').find({ projectId }).toArray();

      default:
        // Use existing channel manager
        return [];
    }
  }
}

module.exports = DatabaseService;