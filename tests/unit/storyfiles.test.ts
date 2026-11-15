import { describe, expect, it } from 'vitest';
import { docxText } from '../../src/content/ui/storyFiles';

// tests/fixtures/story.docx (a tiny Word file with two paragraphs)
const DOCX = 'UEsDBBQAAAAIAGY4b13muHRrXAAAAGIAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbBXMTQqAIBBA4auE+xxr0SJKL9EFRKYfylGcIer22fLxwZvcE6/mxsJHoll12ihnp+XNyE0V4lntInkE4LBj9KxTRqqyphK91CwbZB9OvyH0xgwQEgmStPI/FNgPUEsDBBQAAAAIAGY4b13fW3hV8wAAAGMBAAARAAAAd29yZC9kb2N1bWVudC54bWxtkE1OwzAQha8y8oIVxIEFQiFJdz0BHCAkpo1U/8hOCdyiEa1EpVBBJEDhQnMdZiIQC9g8z7x538h2OrvXK7hTPtTWZOI0igUoU9qqNotMXF/NTy7ELE/bpLLlWivTAOVNSNpMLJvGJVKGcql0ESLrlKHZrfW6aKj1C9laXzlvSxUCrdMreRbH51IXtRG88sZWD3w6Fs/S5LjFF3zFPQ64Beyp7HCTSh6x+kndH2qPO9xgBxM8MNjhI5DVA22clgCOZO+A6g/Kd0S8HQPpiM8MHBjoqTuQNzD7yexI6Sc4KrS7/PYGfOdM9M+t5M+j5O+H5V9QSwECFAMUAAAACABmOG9d5rh0a1wAAABiAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIAGY4b13fW3hV8wAAAGMBAAARAAAAAAAAAAAAAACAAY0AAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAgACAIAAAACvAQAAAAA=';

describe('story files', () => {
  it('reads the text of a Word file (.docx)', async () => {
    const bytes = Uint8Array.from(atob(DOCX), (c) => c.charCodeAt(0));
    const text = await docxText(bytes.buffer);
    expect(text).toBe('הנסיעה לסבא\nיואב נסע לבד אל הסבא שלו בקיבוץ, ושם למד לשמוע את השקט & את עצמו.');
  });
});
