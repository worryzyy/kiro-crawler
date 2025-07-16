import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// API endpoint configuration
const ENDPOINTS = {
  'macOS (ARM64)': 'https://prod.download.desktop.kiro.dev/stable/metadata-dmg-darwin-arm64-stable.json',
  'macOS (x64)': 'https://prod.download.desktop.kiro.dev/stable/metadata-dmg-darwin-x64-stable.json',
  'Windows (x64)': 'https://prod.download.desktop.kiro.dev/stable/metadata-win32-x64-user-stable.json',
  'Linux (x64 DEB)': 'https://prod.download.desktop.kiro.dev/stable/metadata-linux-x64-deb-stable.json',
  'Linux (x64)': 'https://prod.download.desktop.kiro.dev/stable/metadata-linux-x64-stable.json'
};

// Data file paths
const DATA_FILE = 'kiro-versions.json';
const README_FILE = 'README.md';

// Get version information for a single platform
async function fetchPlatformData(platform, url) {
  try {
    console.log(`Fetching version information for ${platform}...`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      platform,
      currentRelease: data.currentRelease,
      releases: data.releases || []
    };
  } catch (error) {
    console.error(`Failed to fetch data for ${platform}:`, error.message);
    return {
      platform,
      currentRelease: null,
      releases: [],
      error: error.message
    };
  }
}

// Read existing data
async function loadExistingData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('Existing data file not found, creating new file');
    return {
      lastUpdated: null,
      platforms: {}
    };
  }
}

// Save data to JSON file
async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Data saved to ${DATA_FILE}`);
}

// Generate Markdown document
function generateMarkdown(data) {
  const now = new Date().toISOString().split('T')[0];
  
  // Get latest version information
  const latestVersion = Object.values(data.platforms)
    .filter(p => !p.error && p.currentRelease)
    .map(p => p.currentRelease)
    .sort()
    .reverse()[0] || 'N/A';
  
  let markdown = `<div align="center">
  <img src="./public/kiro.png" alt="Kiro IDE Logo" width="60" height="60">
  
  # 🚀 Kiro IDE Version History
</div>

> Last Updated: ${now}

## Latest Version

<div align="center">

### 📌 Kiro ${latestVersion}

**Release Date: ${now}**

</div>

### Download Links

| Windows | macOS | Linux |
|---------|-------|-------|
| 🪟 **WINDOWS** | 🍎 **MACOS** | 🐧 **LINUX** |`;

  // Generate download links table
  const platforms = data.platforms;
  let windowsLinks = [];
  let macosLinks = [];
  let linuxLinks = [];

  // Collect download links for each platform
  Object.entries(platforms).forEach(([platform, info]) => {
    if (info.error || !info.releases || info.releases.length === 0) return;
    
    info.releases.forEach(release => {
      const updateInfo = release.updateTo;
      if (!updateInfo) return;
      
      let linkText = '';
      if (updateInfo.url.includes('.dmg')) {
        linkText = platform.includes('ARM64') ? 'ARM64 Download' : 'x64 Download';
        macosLinks.push(`[${linkText}](${updateInfo.url})`);
      } else if (updateInfo.url.includes('.exe')) {
        linkText = 'x64 Download';
        windowsLinks.push(`[${linkText}](${updateInfo.url})`);
      } else if (updateInfo.url.includes('.deb')) {
        linkText = 'DEB Download';
        linuxLinks.push(`[${linkText}](${updateInfo.url})`);
      } else if (updateInfo.url.includes('.tar.gz')) {
        linkText = 'x64 Download';
        linuxLinks.push(`[${linkText}](${updateInfo.url})`);
      }
    });
  });

  // Add download links to table
  const maxRows = Math.max(windowsLinks.length, macosLinks.length, linuxLinks.length);
  for (let i = 0; i < maxRows; i++) {
    const winLink = windowsLinks[i] || '';
    const macLink = macosLinks[i] || '';
    const linuxLink = linuxLinks[i] || '';
    markdown += `\n| ${winLink} | ${macLink} | ${linuxLink} |`;
  }

  markdown += `\n\n## All Versions Download Table\n\n`;

  // Collect data grouped by version
  const versionGroups = {};
  
  Object.entries(data.platforms).forEach(([platform, info]) => {
    if (info.error || !info.releases || info.releases.length === 0) {
      return;
    }

    info.releases.forEach(release => {
      const updateInfo = release.updateTo;
      if (updateInfo && updateInfo.url.match(/\.(dmg|exe|deb|tar\.gz)$/)) {
        const version = release.version;
        if (!versionGroups[version]) {
          versionGroups[version] = {
            version,
            date: updateInfo.pub_date,
            windows: [],
            macos: [],
            linux: [],
            changelog: 'N/A'
          };
        }
        
        // Categorize by platform and file type
        if (updateInfo.url.includes('.exe')) {
          versionGroups[version].windows.push({
            type: 'x64',
            url: updateInfo.url,
            badge: '🪟 x64'
          });
        } else if (updateInfo.url.includes('.dmg')) {
          const isARM = platform.includes('ARM64');
          versionGroups[version].macos.push({
            type: isARM ? 'ARM64' : 'x64',
            url: updateInfo.url,
            badge: isARM ? '🍎 ARM64' : '🍎 x64'
          });
        } else if (updateInfo.url.includes('.deb')) {
          versionGroups[version].linux.push({
            type: 'DEB',
            url: updateInfo.url,
            badge: '🐧 DEB'
          });
        } else if (updateInfo.url.includes('.tar.gz')) {
          versionGroups[version].linux.push({
            type: 'x64',
            url: updateInfo.url,
            badge: '🐧 x64'
          });
        }
      }
    });
  });

  if (Object.keys(versionGroups).length > 0) {
    // Sort by version
    const sortedVersions = Object.values(versionGroups).sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.version.localeCompare(a.version);
    });

    // Generate table
    markdown += `| Version | Date | Windows | macOS | Linux | Changelog |\n`;
    markdown += `|---------|------|---------|-------|-------|----------|\n`;
    
    sortedVersions.forEach(versionData => {
      const windowsLinks = versionData.windows.map(w => `[${w.badge}](${w.url})`).join('<br>');
      const macosLinks = versionData.macos.map(m => `[${m.badge}](${m.url})`).join('<br>');
      const linuxLinks = versionData.linux.map(l => `[${l.badge}](${l.url})`).join('<br>');
      
      markdown += `| ${versionData.version} | ${versionData.date} | ${windowsLinks || '-'} | ${macosLinks || '-'} | ${linuxLinks || '-'} | ${versionData.changelog} |\n`;
    });
    
    markdown += `\n`;
  } else {
    markdown += `No version information available\n\n`;
  }

  // Add error information (if any)
  const errorPlatforms = Object.entries(data.platforms).filter(([_, info]) => info.error);
  if (errorPlatforms.length > 0) {
    markdown += `## Failed Platforms\n\n`;
    markdown += `| Platform | Error Message |\n`;
    markdown += `|----------|---------------|\n`;
    errorPlatforms.forEach(([platform, info]) => {
      markdown += `| ${platform} | ${info.error} |\n`;
    });
    markdown += `\n`;
  }

  // Add statistics information
  markdown += `## Statistics\n\n`;
  const totalPlatforms = Object.keys(data.platforms).length;
  const successfulPlatforms = Object.values(data.platforms).filter(p => !p.error).length;
  const totalReleases = Object.values(data.platforms).reduce((sum, p) => sum + (p.releases?.length || 0), 0);
  
  markdown += `- Supported Platforms: ${totalPlatforms}\n`;
  markdown += `- Successfully Retrieved: ${successfulPlatforms}\n`;
  markdown += `- Total Release Files: ${totalReleases}\n`;
  markdown += `\n---\n`;
  markdown += `\n*This document is automatically generated from Kiro official API*\n`;

  return markdown;
}

// Save Markdown document
async function saveMarkdown(content) {
  await fs.writeFile(README_FILE, content, 'utf-8');
  console.log(`Markdown document saved to ${README_FILE}`);
}

// Check if there are new versions
function hasNewVersions(oldData, newData) {
  if (!oldData.platforms) return true;
  
  for (const [platform, newInfo] of Object.entries(newData.platforms)) {
    const oldInfo = oldData.platforms[platform];
    
    if (!oldInfo) return true;
    if (oldInfo.currentRelease !== newInfo.currentRelease) return true;
    if ((oldInfo.releases?.length || 0) !== (newInfo.releases?.length || 0)) return true;
  }
  
  return false;
}

// Main function
async function main() {
  console.log('Starting to crawl Kiro version information...');
  
  // Read existing data
  const existingData = await loadExistingData();
  
  // Get all platform data
  const platformPromises = Object.entries(ENDPOINTS).map(([platform, url]) => 
    fetchPlatformData(platform, url)
  );
  
  const platformResults = await Promise.all(platformPromises);
  
  // Build new data structure
  const newData = {
    lastUpdated: new Date().toISOString(),
    platforms: {}
  };
  
  platformResults.forEach(result => {
    newData.platforms[result.platform] = {
      currentRelease: result.currentRelease,
      releases: result.releases,
      error: result.error || null
    };
  });
  
  // Check for updates
  const hasUpdates = hasNewVersions(existingData, newData);
  
  if (hasUpdates) {
    console.log('Detected new version or data changes, updating files...');
    
    // Save data
    await saveData(newData);
    
    // Generate and save Markdown
    const markdown = generateMarkdown(newData);
    await saveMarkdown(markdown);
    
    console.log('✅ Update completed!');
  } else {
    console.log('📋 No new version detected, skipping update');
  }
  
  // Output summary
  console.log('\n=== Crawling Summary ===');
  Object.entries(newData.platforms).forEach(([platform, info]) => {
    const status = info.error ? '❌' : '✅';
    const version = info.currentRelease || 'N/A';
    const releaseCount = info.releases?.length || 0;
    console.log(`${status} ${platform}: v${version} (${releaseCount} files)`);
  });
}

// Run script
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('crawler.js')) {
  main().catch(console.error);
}

export { main };