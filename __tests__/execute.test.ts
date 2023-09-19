import { describe, expect, it } from '@jest/globals';
import { execute } from '../src/execute';

describe('execute', () => {
    it('should execute a command successfully', async () => {
        // Arrange
        const cmd = 'echo';
        const args = ['hello', 'world'];

        // Act
        const result = await execute(cmd, process.cwd(), args, false, false);

        // Assert
        expect(result.result).toBe(true);
        expect(result.stdout.join('')).toBe('hello world\n');
        expect(result.stderr.join('')).toBe('');
    });
});
