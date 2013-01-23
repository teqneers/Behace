define('ace/mode/behat', function( require, exports, module ) {

	var oop = require( "../lib/oop" );
	var TextMode = require( "ace/mode/text" ).Mode;
	var Tokenizer = require( "ace/tokenizer" ).Tokenizer;
	var Range = require( "ace/range" ).Range;
	var TextHighlightRules = require( "ace/mode/text_highlight_rules" ).TextHighlightRules;
	var BehatHighlightRules = function() {
		
		this.$rules = {
			"start" : [
				{
					token : "string", // single line
					regex : '["](?:(?:\\\\.)|(?:[^"\\\\]))*?["]'
				},
				{
					token : "comment",
					regex : "^\\s*#.*$"
				},
				{
					token : "comment.doc.tag",
					regex : "@[^@\\\r\\\n\\\t ]+"
				},
				{
					token : "keyword.with_children",
					regex : "^\\s*(?:Scenarios|Examples|Scenario Template|Scenario Outline|Scenario|Background|Ability|Business Need|Feature):"
				},
				{
					token : "keyword",
					regex : "^\\s*(?:But |And |Then |When |Given |\\* )"
				},
				{
					token : "string",           // multi line """ string start
					regex : '^\\s*"{3}.*$',
					next : "qqstring"
				}
			],
			"qqstring" : [
				{
					token : "string", // multi line """ string end
					regex : '(?:[^\\\\]|\\\\.)*?"{3}',
					next  : "start"
				}, {
					token : "string",
					regex : '.+'
				}
			]
		};
	};

	oop.inherits( BehatHighlightRules, TextHighlightRules );

	var Mode = function()
	{
		this.$tokenizer = new Tokenizer( new BehatHighlightRules().getRules() );
	};
	oop.inherits( Mode, TextMode );

	(function()
	{
		this.getNextLineIndent = function( state, line, tab ) {
			var indent = this.$getIndent( line );
			var tokenizedLine = this.$tokenizer.getLineTokens( line, state );
			var tokens = tokenizedLine.tokens;
			if ( tokens.length && tokens[0].type == "keyword.with_children" ) {
				indent += tab;
			}
			return indent;
		};

	}).call(Mode.prototype);

	exports.Mode = Mode;
});
