const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
            // Try to use the local vultc binary if available for better C++ generation
            const vultcPath = path.join(__dirname, 'node_modules', '.bin', 'vultc');
            if (fs.existsSync(vultcPath)) {
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
            } else {
                // Fallback to internal compiler.generateC if vultc is not found
                try {
                    const compilation = compiler.generateC(code, ["-template", "none"]);
                    process.stdout.write(JSON.stringify({ 
                        code: Array.isArray(compilation) ? compilation.map(f => `// File: ${f.name}\n${f.code}`).join("\n\n") : (compilation.code || compilation),
                        errors: []
                    }));
                } catch (e) {
                    process.stdout.write(JSON.stringify({ errors: [{ msg: "Fallback C transcompilation failed: " + e.toString() }] }));
                }
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
