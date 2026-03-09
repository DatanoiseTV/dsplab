const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const SANDBOX_WORKDIR = process.env.VULT_SANDBOX_DIR || null;
const USE_SANDBOX = process.env.VULT_SANDBOX === 'true';

function isPathInDirectory(filepath, directory) {
    const absFile = path.resolve(filepath);
    const absDir = path.resolve(directory);
    return absFile.startsWith(absDir + path.sep) || absFile === absDir;
}

function validatePaths(baseDir) {
    if (!baseDir || !fs.existsSync(baseDir)) {
        return false;
    }
    const stats = fs.statSync(baseDir);
    return stats.isDirectory();
}

// Global mocks for js_of_ocaml
global.window = global;
global.self = global;
global.navigator = { userAgent: 'node' };

const vultModule = require('./public/vultweb.cjs');
const compiler = vultModule.vult || vultModule;

if (!compiler || typeof compiler.generateJSCode !== 'function') {
    process.stderr.write(JSON.stringify({ error: "Vult compiler failed to initialize correctly in Node." }));
    process.exit(1);
}

let inputData = '';
process.stdin.on('data', chunk => { inputData += chunk; });
process.stdin.on('end', async () => {
    try {
        const { code, target } = JSON.parse(inputData);
        if (!code) throw new Error("No code provided");

        if (target === 'c' || target === 'cpp') {
            // Sandbox mode: use external vultc but restricted to temp workdir
            // Set VULT_ALLOW_EXTERNAL=true to disable sandbox (NOT recommended for public use)
            const allowExternal = process.env.VULT_ALLOW_EXTERNAL === 'true';
            
            // Determine workdir for sandboxing (defaults to system temp)
            let workDir = SANDBOX_WORKDIR;
            if (!workDir || !validatePaths(workDir)) {
                workDir = os.tmpdir();
            }
            
            // If sandbox mode is enabled OR no explicit permission for external, use sandbox
            if (!allowExternal || USE_SANDBOX) {
                // SANDBOXED MODE: Use external vultc but with strict path validation
                const vultcPath = path.join(__dirname, 'node_modules', '.bin', 'vultc');
                if (fs.existsSync(vultcPath)) {
                    const baseName = 'vult_out_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
                    const tmpFile = path.join(workDir, baseName + '.vult');
                    const outBase = path.join(workDir, baseName);
                    
                    // Security: validate all paths are within workdir
                    if (!isPathInDirectory(tmpFile, workDir) || !isPathInDirectory(outBase, workDir)) {
                        process.stdout.write(JSON.stringify({ errors: [{ msg: "Security error: Invalid sandbox paths" }] }));
                        return;
                    }
                    
                    fs.writeFileSync(tmpFile, code);
                    
                    const vultc = spawn(vultcPath, [tmpFile, '-ccode', '-o', outBase]);
                    let output = '';
                    let error = '';
                    
                    vultc.stdout.on('data', data => { output += data; });
                    vultc.stderr.on('data', data => { error += data; });
                    
                    vultc.on('close', (exitCode) => {
                        // Clean up input file
                        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch(e) {}
                        
                        if (exitCode === 0) {
                            const cppFile = outBase + '.cpp';
                            const hFile = outBase + '.h';
                            let finalCode = '';
                            
                            // Validate and read output files
                            if (fs.existsSync(cppFile)) {
                                if (!isPathInDirectory(cppFile, workDir)) {
                                    process.stdout.write(JSON.stringify({ errors: [{ msg: "Security error: Output path outside sandbox" }] }));
                                    return;
                                }
                                finalCode += `// File: ${path.basename(cppFile)}\n` + fs.readFileSync(cppFile, 'utf8');
                                try { fs.unlinkSync(cppFile); } catch(e) {}
                            }
                            if (fs.existsSync(hFile)) {
                                if (!isPathInDirectory(hFile, workDir)) {
                                    process.stdout.write(JSON.stringify({ errors: [{ msg: "Security error: Output path outside sandbox" }] }));
                                    return;
                                }
                                finalCode += `\n\n// File: ${path.basename(hFile)}\n` + fs.readFileSync(hFile, 'utf8');
                                try { fs.unlinkSync(hFile); } catch(e) {}
                            }
                            
                            // Clean up tables.h if exists
                            const tablesFile = outBase + '.tables.h';
                            try { if (fs.existsSync(tablesFile)) fs.unlinkSync(tablesFile); } catch(e) {}
                            
                            process.stdout.write(JSON.stringify({ code: finalCode, errors: [] }));
                        } else {
                            process.stdout.write(JSON.stringify({ errors: [{ msg: error || output || "vultc transcompilation failed" }] }));
                        }
                    });
                    return;
                } else {
                    // vultc not found - try internal compiler as fallback
                    try {
                        const compilation = compiler.generateC(code);
                        const codeStr = typeof compilation === 'string' ? compilation : JSON.stringify(compilation);
                        process.stdout.write(JSON.stringify({ code: codeStr, errors: [] }));
                    } catch (e) {
                        process.stdout.write(JSON.stringify({ errors: [{ msg: "vultc not found and internal compiler failed: " + e.toString() }] }));
                    }
                    return;
                }
            }

            // External mode (only if explicitly allowed AND sandbox disabled)
            const vultcPath = path.join(__dirname, 'node_modules', '.bin', 'vultc');
            if (fs.existsSync(vultcPath) && allowExternal && !USE_SANDBOX) {
                const baseName = 'vult_out_' + Date.now();
                const tmpFile = path.join(__dirname, baseName + '.vult');
                const outBase = path.join(__dirname, baseName);
                fs.writeFileSync(tmpFile, code);
                
                const vultc = spawn(vultcPath, [tmpFile, '-ccode', '-o', outBase]);
                let output = '';
                let error = '';
                
                vultc.stdout.on('data', data => { output += data; });
                vultc.stderr.on('data', data => { error += data; });
                
                vultc.on('close', (exitCode) => {
                    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch(e) {}
                    if (exitCode === 0) {
                        const cppFile = outBase + '.cpp';
                        const hFile = outBase + '.h';
                        let finalCode = '';
                        if (fs.existsSync(cppFile)) {
                            finalCode += `// File: ${path.basename(cppFile)}\n` + fs.readFileSync(cppFile, 'utf8');
                            try { fs.unlinkSync(cppFile); } catch(e) {}
                        }
                        if (fs.existsSync(hFile)) {
                            finalCode += `\n\n// File: ${path.basename(hFile)}\n` + fs.readFileSync(hFile, 'utf8');
                            try { fs.unlinkSync(hFile); } catch(e) {}
                        }
                        process.stdout.write(JSON.stringify({ code: finalCode, errors: [] }));
                    } else {
                        process.stdout.write(JSON.stringify({ errors: [{ msg: error || output || "vultc transcompilation failed" }] }));
                    }
                });
                return;
            }
        }

        // JS Compilation (Default)
        let jsCode = compiler.generateJSCode(code);
        
        if (jsCode.includes("Required functions are not defined")) {
            const stubs = `
            and noteOn(n:int,v:int,c:int) {}
            and noteOff(n:int,c:int) {}
            and controlChange(c:int,v:int,ch:int) {}
            and default() {}
            `;
            jsCode = compiler.generateJSCode(code + "\n" + stubs);
        }

        if (jsCode.includes("Errors in the program") || jsCode.includes("Error:")) {
            process.stdout.write(JSON.stringify({ errors: [{ msg: jsCode }] }));
        } else {
            process.stdout.write(JSON.stringify({ code: jsCode, errors: [] }));
        }
    } catch (e) {
        process.stdout.write(JSON.stringify({ errors: [{ msg: e.toString() }] }));
    }
});
