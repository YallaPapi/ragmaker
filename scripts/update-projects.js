const fs = require('fs');
const path = require('path');

function upsert(obj, key, value) {
  if (obj[key] === undefined) obj[key] = value;
}

function run() {
  const file = path.join(__dirname, '..', 'data', 'projects.json');
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const projects = data.projects || {};
  const now = new Date().toISOString();

  for (const id of Object.keys(projects)) {
    const p = projects[id] || {};
    upsert(p, 'isPublic', false);
    upsert(p, 'slug', (p.name || id).toLowerCase().replace(/\s+/g, '-'));
    upsert(p, 'viewCount', 0);
    upsert(p, 'lastActive', p.createdAt || now);
    upsert(p, 'chatCount', 0);
    projects[id] = p;
  }

  if (data.currentProject && projects[data.currentProject]) {
    projects[data.currentProject].isPublic = true;
    projects[data.currentProject].slug = (projects[data.currentProject].name || data.currentProject)
      .toLowerCase().replace(/\s+/g, '-');
    projects[data.currentProject].lastActive = now;
  }

  fs.writeFileSync(file, JSON.stringify({
    projects,
    currentProject: data.currentProject || null
  }, null, 2));

  console.log('Updated', file);
}

run();
