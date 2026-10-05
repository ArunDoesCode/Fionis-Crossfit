import { z } from 'zod';

// BR-REC-189: the one global fallback so a form never shows a library sentence ("Invalid input: expected
// string, received undefined", "Required", ...). Every field still sets its own specific message; this only
// catches the ones that slip through. Schema-level messages always win over this.
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case 'invalid_type':
        return 'Fill this in';
      case 'too_small':
        return 'Fill this in or use a larger value';
      case 'too_big':
        return 'Use a smaller value';
      case 'invalid_format':
      case 'invalid_value':
      case 'not_multiple_of':
        return 'Enter a valid value';
      default:
        return 'Enter a valid value';
    }
  },
});
