const fs = require('fs');
const content = fs.readFileSync('style.css', 'utf8');
let braceCount = 0;
let inString = false;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  if (char === '"' || char === "'") inString = !inString;
  if (!inString && (char === '{' || char === '}')) braceCount += (char === '{' ? 1 : -1);
}

console.log('Brace count:', braceCount);
if (braceCount !== 0) {
  console.log('ERROR: Unmatched braces found!');
  process.exit(1);
} else {
  console.log('OK: All braces matched');
}
