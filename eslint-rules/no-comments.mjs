const DIRECTIVE = /^\s*(?:eslint-disable|eslint-enable|@ts-(?:expect-error|ignore|nocheck|check)\b|\/\s*<reference\b|(?:webpack|turbopack)[A-Z]\w*\s*:)/;

export function isDirective(value) {
  return DIRECTIVE.test(value);
}

export default {
  meta: {
    type: "suggestion",
    docs: { description: "Ban code comments. Name things so the code says it, and record decisions in docs/adr." },
    messages: {
      noComment: "No comments. Make the code say it, or record the decision in docs/adr. Run /delete-comment for the process.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === "Shebang" || isDirective(comment.value)) continue;
          context.report({ loc: comment.loc, messageId: "noComment" });
        }
      },
    };
  },
};
