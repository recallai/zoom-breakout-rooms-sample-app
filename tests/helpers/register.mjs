// Resolve the same @/ aliases and extensionless TypeScript imports as Next.js.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'next/server') return nextResolve('next/server.js', context);
        const base = specifier.startsWith('@/') ? path.resolve('src', specifier.slice(2))
            : specifier.startsWith('.') && context.parentURL?.startsWith('file:')
                ? path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier) : null;
        if (base) {
            for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
                if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
            }
        }
        return nextResolve(specifier, context);
    },
});
