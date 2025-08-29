// Script to fix escaped template literals
const fs = require('fs');
const path = require('path');

function fixTemplateStrings(content) {
    // Replace escaped template literals with string concatenation
    return content.replace(/\\`([^`]*?)\\$/g, (match, p1, p2, p3) => {
        // Convert template literal to string concatenation
        const parts = match.split('${');
        if (parts.length === 1) {
            // No variables, just remove escapes
            return match.replace(/\\`/g, "'");
        }
        
        let result = '';
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
                result += "'" + parts[i].replace(/\\`/, '') + "'";
            } else {
                const endPos = parts[i].indexOf('}');
                if (endPos !== -1) {
                    const variable = parts[i].substring(0, endPos);
                    const rest = parts[i].substring(endPos + 1).replace(/\\`$/, '');
                    result += ' + ' + variable;
                    if (rest) {
                        result += " + '" + rest + "'";
                    }
                }
            }
        }
        return result;
    });
}

const filesToFix = [
    'C:\\Users\\stuar\\Desktop\\Projects\\ragmaker\\app\\backend\\src\\services\\ai\\OllamaService.js',
    'C:\\Users\\stuar\\Desktop\\Projects\\ragmaker\\app\\backend\\src\\services\\rag\\LocalRAGProfiles.js', 
    'C:\\Users\\stuar\\Desktop\\Projects\\ragmaker\\app\\backend\\src\\services\\embeddings\\LocalEmbeddingService.js'
];

filesToFix.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Simple replacements for common patterns
        content = content.replace(/\\`Model \\${modelName} not found, attempting to pull...\\`/g, "'Model ' + modelName + ' not found, attempting to pull...'");
        content = content.replace(/\\`Failed to pull model \\${modelName}\\`/g, "'Failed to pull model ' + modelName");
        content = content.replace(/\\`Error ensuring model \\${modelName} is available:\\`/g, "'Error ensuring model ' + modelName + ' is available:'");
        content = content.replace(/\\`Failed to get info for model \\${modelName}: \\${error.message}\\`/g, "'Failed to get info for model ' + modelName + ': ' + error.message");
        content = content.replace(/\\`\\${Math.round\\(ms\\)}ms\\`/g, "Math.round(ms) + 'ms'");
        content = content.replace(/\\`\\${Math.round\\(seconds \\* 10\\) \\/ 10}s\\`/g, "Math.round(seconds * 10) / 10 + 's'");
        content = content.replace(/\\`\\${Math.round\\(minutes \\* 10\\) \\/ 10}m\\`/g, "Math.round(minutes * 10) / 10 + 'm'");
        
        fs.writeFileSync(filePath, content);
        console.log('Fixed:', filePath);
    }
});

console.log('Template literal fixes complete');