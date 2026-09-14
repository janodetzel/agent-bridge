/**
 * Every way a module specifier reaches the AST. A rule that only visits
 * `ImportDeclaration` is one `require()` away from being silently bypassed.
 */
export function moduleSpecifierVisitors(onSpecifier) {
	const fromLiteral = (node) =>
		node && node.type === "Literal" && typeof node.value === "string" ? node : null;

	return {
		ImportDeclaration: (node) => onSpecifier(node.source.value, node.source),
		ExportNamedDeclaration: (node) => {
			if (node.source) onSpecifier(node.source.value, node.source);
		},
		ExportAllDeclaration: (node) => {
			if (node.source) onSpecifier(node.source.value, node.source);
		},
		ImportExpression: (node) => {
			const literal = fromLiteral(node.source);
			if (literal) onSpecifier(literal.value, literal);
		},
		CallExpression: (node) => {
			if (node.callee.type !== "Identifier" || node.callee.name !== "require") return;
			const literal = fromLiteral(node.arguments[0]);
			if (literal) onSpecifier(literal.value, literal);
		},
	};
}
