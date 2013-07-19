//####################################
// REQUIRES
//####################################
Ext.Loader.setPath('Ext.ux', '.');
Ext.require([
	'Ext.ux.TreeFilter',
	'Ext.tip.QuickTipManager'
]);
var UndoManager = require("ace/undomanager").UndoManager;

//####################################
// INITS
//####################################
var editorSettings				= {};
editorSettings['fontSize']		= 12;
editorSettings['tabSize']		= 4;
editorSettings['softTabs']		= false;
editorSettings['theme']			= 'textmate';
editorSettings['wrapMode']		= false;
editorSettings['lineHighlight']	= true;
editorSettings['printMargin']	= false;

// behat settings
var behatSettings			= {};
behatSettings['output']		= 'pretty';
behatSettings['useColors']	= true;
behatSettings['hidePaths']	= true;

// contains all open editors and open files connected to the open tabs in an 'associative array'
// editorBib[0] contains all the available editors and editorBib[1] contains the open files
var editorBib	= [];
editorBib[0]	= {};
editorBib[1]	= {};

// create the tree filter
var treeFilter	= Ext.create('Ext.ux.TreeFilter');

// init the tooltips
Ext.QuickTips.init();

// clipboard for copy paste cut
var clipboard	= null;

//###############################
// STORES
//###############################
// store for the folder structure (west)
var store	= Ext.create('Ext.data.TreeStore', {
	proxy: {
		type: 'ajax',
		url: 'ajax_behat.php?route=getDirList',
		listeners: {
			exception: function(proxy, response, operation) {
				if (operation.exception && operation.action == "read") {
					Ext.MessageBox.show({
						title: 'Error',
						msg: 'Can not read feature folder. Please check permissions.',
						buttons: Ext.MessageBox.OK,
						icon: Ext.MessageBox.WARNING
					});
				}
			}
		}
	},
	folderSort: true,
	autoLoad: true,
	sorters: [{
		property: 'text',
		direction: 'ASC'
	}]
});

// store for the syntax list (east)
var wordStore	= Ext.create('Ext.data.Store', {
	storeId: 'behatSyntaxStore',
	fields: ['code', 'group'],
	autoLoad: true,
	sortOnFilter: true,
	proxy: {
		type: 'ajax',
		url: 'ajax_behat.php?route=getSyntaxList',
		reader: {
			type: 'json',
			root: 'items'
		}
	},
	groupers:[{
		property: 'group',
		direction: 'ASC'
	}]
});

// a syntax store for the autoocomplete feature
var autoCoStore	= Ext.create('Ext.data.Store', {
	storeId: 'behatSyntaxStore',
	fields: ['code'],
	autoLoad: true,
	sortOnFilter: true,
	proxy: {
		type: 'ajax',
		url: 'ajax_behat.php?route=getSyntaxList',
		reader: {
			type: 'json',
			root: 'items'
		}
	},
	sorters:[{
		property: 'code',
		direction: 'ASC'
	}]
});

// store for the regex selection
var regExStore	= Ext.create('Ext.data.Store', {
	id: 'regExStore',
	fields: ['option'],
	data: null
});

// store for all available themes
var themeList = Ext.create('Ext.data.Store', {
	fields: ['name', 'theme'],
	data : [
		{"name":"textmate", "theme":"textmate"},
		{"name":"ambiance", "theme":"ambiance"},
		{"name":"chrome", "theme":"chrome"},
		{"name":"crimson_editor", "theme":"crimson"},
		{"name":"idle_fingers", "theme":"idle"},
		{"name":"merbivore", "theme":"merbivore"},
		{"name":"merbivore_soft", "theme":"merbivore soft"},
		{"name":"twilight", "theme":"twilight"},
		{"name":"vibrant_ink", "theme":"vibrant ink"}
	]
});

// store for available behat output formats
var behatOutputList = Ext.create('Ext.data.Store', {
	fields: ['name', 'output'],
	data : [
		{"name":"pretty", "output":"pretty"},
		{"name":"progress", "output":"progress"}
	]
});

//###########################################################
// THE REGEX SELECT WINDOW
//###########################################################
var regExWindow	= Ext.create('Ext.window.Window', {
	id: 'regExWindow',
	layout: 'card',
	border: false,
	closable: false,
	draggable: false,
	resizable: false,
	autoScroll: false,
	height: 50,
	width: 150,
	items:[{
		xtype: 'grid',
		id: 'regExGrid',
		border: false,
		hideHeaders: true,
		forceFit: true,
		columns: [{
			header: 'option',
			dataIndex: 'option'
		}],
		listeners: {
			itemclick: function(view, node) {
				editor.find('(', {
					backwards: true
				});
				editor.find(needlePos[searchPos], {
					backwards: false,
					skipCurrent: false,
					range: editor.getSelection().getLineRange()
				});
				editor.replace(Ext.getCmp('regExGrid').getSelectionModel().getSelection()[0].data.option);
				regExWindow.hide();
				regExStore.removeAll();

				// simulate a tab press
				goToNextVariable();
			}
		},
		store: regExStore
	}]
});


//###########################################################
// THE AUTOCOMPLETE WINDOW
//###########################################################
var autoCoWindow	= Ext.create('Ext.window.Window', {
	id: 'autoComplete',
	layout: 'card',
	border: false,
	closable: false,
	draggable: false,
	resizable: false,
	autoScroll: false,
	height: 100,
	width: 450,
	items:[{
		xtype: 'grid',
		id: 'autoCoGrid',
		border: false,
		hideHeaders: true,
		forceFit: true,
		columns: [{
			header: 'code',
			dataIndex: 'code'
		}],
		store: autoCoStore,
		listeners: {
			itemclick: function(obj, record, item, index, e) {
				insertSelectedSentence(e);
				addCommand();
			}
		}
	}]
});

//####################################
// FUNCTIONS
//####################################
/**
 * filters the associated line for %value, %type or %number and saves it in an array. Thereafter starts searching the first occurrence
 */
function searchNeedle(line) {
	editorFocus();
	var pos				= editor.getSelection().getCursor();
	var rowValue		= (line == null) ? editor.getSession().getLine(pos.row) : line;
	window.searchPos	= 0;
	window.needlePos	= rowValue.match(/\(([^\)]+)\)|%[a-z]+/g);
	window.isSearch		= true;

	if (needlePos != null && needlePos.length !== 0) {
		editor.commands.removeCommand('indent');
		editor.commands.removeCommand('outdent');
		editor.navigateLineStart();
		editor.find(needlePos[searchPos], {
			backwards: false,
			range: editor.getSelection().getLineRange()
		});
		if (needlePos[searchPos].charAt(0) == '(') {
			triggerRegExSelector();
		}
	}
}

/**
 * Get the string between the brackets
 */
function getTextInBrackets(string) {
	var result	= [];
	var regEx	= /\(([^\)]+)\)/g;
	var text;

	while(text = regEx.exec(string)) {
		result.push(text[1]);
	}
	return result;
}

/**
 * Builds a dropdown for regex variables, for easier use
 */
function addSelectionToStore(line) {
	if (line.charAt(0) == '(') {
		var regExCount	= (line.split('(').length) - 2;
		var expression	= getTextInBrackets(line);
		var options		= expression[regExCount].split('|');
		var result		= [];

		for (var k = 0; k < options.length; k++) {
			result.push({'option': options[k]});
		}
		regExStore.removeAll();

		if (result.length == 0 || result.length == 1) {
			return false;
		} else {
			regExStore.add(result);
			return true;
		}
	} else {
		return false;
	}
}

/**
 * Triggers the RegEx Selector
 */
function triggerRegExSelector() {
	//deactivating commands 'up' and 'down'
	editor.commands.removeCommand('golinedown');
	editor.commands.removeCommand('golineup');

	var position	= editor.getCursorPosition();
	var dispPos		= editor.renderer.textToScreenCoordinates(position.row, position.column);
	var notEmpty	= addSelectionToStore(needlePos[searchPos]);

	if (notEmpty) {
		if ((window.screen.height - dispPos.pageY) < 250) {
			regExWindow.showAt(dispPos.pageX-20, dispPos.pageY-100);
		} else {
			regExWindow.showAt(dispPos.pageX-20, dispPos.pageY+20);
		}
		editor.focus();
	} else {
		cleanUp();
	}
}

function triggerRegExSelectorOnClick() {
	editor.find('(', {backwards: true, range: editor.getSelection().getLineRange()});
	var start	= editor.getSelection().getCursor();
	editor.jumpToMatching();
	var end		= editor.getSelection().getCursor();
	var Range 	= require('ace/range').Range;
	var range	= new Range(start.row, start.column-1, end.row, end.column+1);
	var line	= editor.getSession().getTextRange(range);
	searchNeedle(line);
}

/**
 * gets the user to the next (available) variable
 */
function goToNextVariable() {
	++searchPos;
	if (searchPos < needlePos.length && typeof(needlePos[searchPos]) !== 'undefined') {
		editor.find(needlePos[searchPos], {
			backwards: false
		});
		if (needlePos[searchPos].match(/\|/g) != null) {
			triggerRegExSelector();
		}
	}
	if (searchPos == needlePos.length || searchPos > needlePos.length) {
		editor.navigateLineEnd();
		cleanUp();
		searchNeedle(null);
	}
	editor.focus();
}

/**
 * Clean and reset
 */
function cleanUp() {
	Ext.getCmp('autoCoGrid').getSelectionModel().clearSelections();
	Ext.getCmp('regExGrid').getSelectionModel().clearSelections();
	window.needlePos	= null;
	window.searchPos	= null;
	autoCoWindow.hide();
	regExWindow.hide();
	autoCoStore.clearFilter();
	regExStore.removeAll();
	editor.focus();
	addCommand();
	addTabCommand();
}

/**
 * Inserts the selected Sentence in the editor
 */
function insertSelectedSentence(e) {
	var selectedEntry	= Ext.getCmp('autoCoGrid').getSelectionModel().getSelection()[0].data.code;
	// true if last Char is a Space
	var lastCharIsSpace	= !!((window.rowValue.charAt(window.rowValue.length - 1) == ' '));
	var rowValue		= window.rowValue.trim();
	if (isAnd) {
		selectedEntry	= selectedEntry.substr(selectedEntry.indexOf(" ") + 1);
	}
	selectedEntry	= lastCharIsSpace ? selectedEntry.substr(rowValue.length+1) : selectedEntry.substr(rowValue.length);
	// prevent enter button to insert new line
	e.preventDefault();
	editor.insert(selectedEntry);
	searchNeedle(null);
	// hide autocomplete, reset filter
	autoCoWindow.hide();
	autoCoStore.clearFilter();
	Ext.getCmp('autoCoGrid').getSelectionModel().clearSelections();
}

/**
 * Marks a whole line when clicking on 'Scenario:' for easier selective testing!
 */
function selectScenario() {
	var position	= editor.getCursorPosition();
	if (editor.getSession().getTokenAt(position.row, position.column) != null) {
		if (editor.getSession().getTokenAt(position.row, position.column).value == 'Scenario:') {
			editor.getSelection().selectLine();
		}
	}
}

/**
 * Triggers the autocomplete window and filters the syntax
 */
function triggerAutocomplete(e) {
	var pos				= editor.getCursorPosition();
	var dispPos			= editor.renderer.textToScreenCoordinates(pos.row, pos.column);
	var startingWord	= null;
	var upperLine		= null;
	var catchwords		= ['Given', 'When', 'Then'];

	//show the autocomplete
	window.rowValue	= editor.getSession().getLine(pos.row);
	rowValue.trim();

	//activation after 4 chars
	if (rowValue.length > 4 && regExWindow.isHidden()) {
		autoCoStore.clearFilter();

		if (rowValue.indexOf('And') == -1) {
			window.isAnd	= false;
			var typed		= rowValue.trim();
			//if and is written, filter autocomplete by first word one line up
		} else if (rowValue.indexOf('And') <= 4) {
			var row			= editor.getCursorPosition().row;
			window.isAnd	= true;
			rowValue		= rowValue.replace('And', '');

			//run up the lines until the editor finds the Catchwords!
			while (row != 1) {
				startingWord	= editor.getSession().getLine(row).trim().split(' ')[0];
				if (catchwords.indexOf(startingWord) != -1) {
					upperLine	= editor.getSession().getLine(row).trim().split(' ')[0];
					row			= 1;
				} else {
					--row;
				}
			}
			var typed	= upperLine+' '+rowValue.trim();
		}

		autoCoStore.filter('code', typed);
		autoCoWindow.doLayout();

		if (autoCoStore.getCount() !== 0 && e.data.text !== "\n" && rowValue.length <= 40 && rowValue.indexOf('|') == -1) {
			//positioning the autocomplete window depending on cursor pos
			if ((window.screen.height - dispPos.pageY) < 250) {
				autoCoWindow.showAt(dispPos.pageX-20, dispPos.pageY-100);
			} else {
				autoCoWindow.showAt(dispPos.pageX-20, dispPos.pageY+20);
			}
			Ext.getCmp('autoCoGrid').getSelectionModel().select(0);
			editor.focus();
			//deactivating commands 'up' and 'down' for 'safety'
			editor.commands.removeCommand('golinedown');
			editor.commands.removeCommand('golineup');
		} else {
			autoCoWindow.hide();
			autoCoStore.clearFilter();
			addCommand();
		}
	} else {
		autoCoWindow.hide();
		autoCoStore.clearFilter();
		addCommand();
	}
}


/*
 * focuses the editor, clears the syntax panel on the right and collapses it
 */
function editorFocus() {
	wordStore.clearFilter();
	Ext.getCmp('filterSyntax').setValue('');
	editor.focus();
}

/*
 * creates an editor with basic settings, connects it to the created tab and saves it to editorBib
 */
function editorFactory(elId, fileId) {
	var editor	= ace.edit(elId);
	editor.getSession().setMode('ace/mode/behat');
	editor.getSession().setUndoManager(new UndoManager());

	editorBib[0][elId]	= editor;
	editorBib[1][elId]	= fileId;
}

/*
 * returns the editor based on the elId (the chosen tab) 
 */
function getEditor(elId) {
	editorBib[0][elId].setTheme("ace/theme/"+editorSettings.theme);
	editorBib[0][elId].setFontSize(editorSettings.fontSize);
	editorBib[0][elId].getSession().setTabSize(editorSettings.tabSize);
	editorBib[0][elId].getSession().setUseSoftTabs(editorSettings.softTabs);
	editorBib[0][elId].getSession().setUseWrapMode(editorSettings.wrapMode);
	editorBib[0][elId].setHighlightActiveLine(editorSettings.lineHighlight);
	editorBib[0][elId].setShowPrintMargin(editorSettings.printMargin);
	return editorBib[0][elId];
}

/*
 * returns the editor based on the elId (the chosen tab) 
 */
function getFileId(elId) {
	return editorBib[1][elId];
}

/*
 * destroys the editor after closing the associated tab
 */
function destroyEditor(elId) {
	delete editorBib[0][elId];
	delete editorBib[1][elId];
}

/*
 * brings back the key maps for up and down
 */
function addCommand() {
	editor.commands.addCommand({
		name: "golinedown",
		bindKey: {win: "Down", mac: "Down"},
		exec: function(editor, args) {
			editor.navigateDown(args.times);
		},
		multiSelectAction: "forEach",
		readOnly: true
	});

	editor.commands.addCommand({
		name: "golineup",
		bindKey: { win:"Up", mac: "Up" },
		exec: function(editor, args) {
			editor.navigateUp(args.times);
		},
		multiSelectAction: "forEach",
		readOnly: true
	})
}

/*
 * brings back the key maps for the tabulator
 */
function addTabCommand() {
	editor.commands.addCommand({
		name: "indent",
		bindKey: {win: "Tab", mac: "Tab" },
		exec: function(editor) {
			editor.indent();
		},
		multiSelectAction: "forEach"
	});
	editor.commands.addCommand({
		name: "outdent",
		bindKey: {win:"Shift-Tab", mac: "Shift-Tab"},
		exec: function(editor) {
			editor.blockOutdent();
		},
		multiSelectAction: "forEach"
	});
}


/*
 * disables the buttons
 */
function disableButtons() {
	Ext.getCmp('saveButton').disable();
	Ext.getCmp('runTest').disable();
	Ext.getCmp('runTestSelected').disable();
	Ext.getCmp('reloadFile').disable();
	Ext.getCmp('searchText').disable();
	Ext.getCmp('copyTextButton').disable();
	Ext.getCmp('cutTextButton').disable();
	Ext.getCmp('pasteTextButton').disable();
	Ext.getCmp('undo').disable();
	Ext.getCmp('redo').disable();
	Ext.getCmp('readOnlyButton').disable();
}

/*
 * enables the buttons
 */
function enableButtons() {
	Ext.getCmp('saveButton').enable();
	Ext.getCmp('runTest').enable();
	Ext.getCmp('runTestSelected').enable();
	Ext.getCmp('reloadFile').enable();
	Ext.getCmp('searchText').enable();
	Ext.getCmp('copyTextButton').enable();
	Ext.getCmp('cutTextButton').enable();
	Ext.getCmp('pasteTextButton').enable();
	Ext.getCmp('undo').enable();
	Ext.getCmp('redo').enable();
	Ext.getCmp('readOnlyButton').enable();
}

/**
 * opens the file from the tree structure and sets basic listeners to editor
 */
function openFile(view, record, tabPanel) {
	var isOpen		= false;
	window.id		= record.get('id');
	window.title	= record.get('text');
	// check if the file is already open!!!
	for (var j = 0; j < tabPanel.items.items.length; j++) {
		if (title == tabPanel.items.items[j].title) {
			isOpen		= true;
			var tabId	= tabPanel.items.items[j].id;
		}
	}

	if (isOpen) {
		tabPanel.setActiveTab(tabId);
	} else {
		Ext.Ajax.request ({
			url: 'ajax_behat.php',
			method: 'post',
			params: {
				route: 'openFile',
				file: id,
				name: title
			},
			success: function(response) {
				var tooltip	= response.responseText.split("\n\n");
				tooltip		= tooltip[0].split("\n")[1];
				var tab		= tabPanel.add({
					title: title,
					closable: true,
					active: true,
					tooltip: tooltip,
					listeners: {
						afterrender: function() {
							editorFactory(this.id, id);
							editor	= getEditor(this.id);
						},
						beforeclose: function(tab) {
							// check if any changes were made to the file and ask user for handling
							if (! editor.getSession().getUndoManager().isClean()) {
								Ext.MessageBox.show({
									title: 'Status',
									msg: 'File changed! <br />Would you like to save your changes?',
									buttons: Ext.MessageBox.YESNOCANCEL,
									fn: function onCloseTab(btn) {
										var tab	= tabPanel.getActiveTab();
										switch(btn) {
											case 'no':
												destroyEditor(tab.id);
												tab.events.beforeclose.clearListeners();
												tab.close();
												return false;
												break;
											case 'yes':
												Ext.Ajax.request({
													url: 'ajax_behat.php',
													method: 'post',
													params: {
														route: 'saveFile',
														id: getFileId(tabPanel.getActiveTab().id),
														fileName : tabPanel.getActiveTab().title,
														content: editor.getSession().getValue()
													},
													success: function(response) {
														var answer	= response.responseText;
														if (answer !== 'File saved successfully!') {
															Ext.create('Ext.window.Window', {
																title: 'Status',
																autoScroll: true,
																height: 250,
																width: 600,
																layout: 'fit',
																html: '<pre>'+answer+'</pre>'
															}).show();
														}
														editorFocus();
														tabPanel.doLayout();
														destroyEditor(tab.id);
														tab.events.beforeclose.clearListeners();
														tab.close();
														return false;
													}
												})
												break;
											case 'cancel':
												break;
										}
									}
								})
							} else {
								destroyEditor(tab.id);
								tab.events.beforeclose.clearListeners();
								tab.close();
								return false;
							}
							return false;
						}
					}
				});
				tabPanel.setActiveTab(tab);
				var text	= response.responseText;
				editor.getSession().setValue(text);
				enableButtons();
				editor.focus();
				editor.navigateFileEnd();

				// trigger autocomplete
				editor.on('change', function(e) {
					triggerAutocomplete(e);
				});
				//the scenario selection event
				editor.on('click',selectScenario);
				//trigger the regex option
				editor.on('dblclick',triggerRegExSelectorOnClick);
			}//success END
		})
	}//if isOpen else END
}

//####################################
// onREADY
//####################################
Ext.onReady(function() {

	// init the different masks
	var testMask	= new Ext.LoadMask(Ext.getBody(), {msg: "running Test..."});
	var loadMask	= new Ext.LoadMask(Ext.getBody(), {msg: "loading..."});
	var saveMask	= new Ext.LoadMask(Ext.getBody(), {msg: "saving..."});

	// the tree Panel
	var tree = Ext.create('Ext.tree.Panel', {
		title: 'Files',
		collapsible: true,
		width: 225,
		store: store,
		rootVisible: false,
		split: true,
		sorters: [{
			property:'text',
			direction: 'ASC'
		}],
		region: 'west',
		bbar:[{
			xtype: 'textfield',
			id: 'filterTree',
			tooltip: 'filters the dir tree',
			emptyText: 'search...',
			hideLabel: true,
			listeners: {
				'change': function() {
					treeFilter.init(tree);
					Ext.getCmp('clearFilter').enable();

					if (this.value.length >= 2) {
						treeFilter.filter(this.value);
					} else if (this.value.length == 0) {
						treeFilter.clearFilter();
						tree.collapseAll();
						Ext.getCmp('clearFilter').disable();
					}
				}
			}
		},{
			id: 'clearFilter',
			tooltip: 'clears the search filter',
			cls: 'x-btn-icon',
			icon: 'icons/cross.png',
			disabled: true,
			handler: function() {
				treeFilter.init(tree);
				treeFilter.clearFilter();
				tree.collapseAll();
				Ext.getCmp('filterTree').setRawValue('');
				Ext.getCmp('clearFilter').disable();
			}
		}],
		listeners: {
			itemclick: function(view, node) {
				//open nodes with a single click
				if (node.isLeaf()) {
					deleteButton.enable();
					newFileButton.disable();
					// got back to single click open file, no dblclick anyymore
					openFile(view, node, tabPanel);
				} else if (node.isExpanded()) {
					node.collapse();
					deleteButton.enable();
					newFileButton.enable();
				} else {
					node.expand();
					deleteButton.enable();
					newFileButton.enable();
				}
			}
		}
	});

	//###########################################################
	// TAB PANEL
	//###########################################################
	var tabPanel	= Ext.create('Ext.tab.Panel', {
		region: 'center',
		id: 'tabPanel',
		listeners: {
			'tabchange': function(tabPanel, newCard) {
				editor	= getEditor(newCard.id);
				editor.focus();
				wordStore.clearFilter();
				autoCoWindow.hide();
			},
			'remove': function(tab, component, eOpts) {
				if (tabPanel.items.length === 0) {
					disableButtons();
				}
				wordStore.clearFilter();
				autoCoWindow.hide();
			}
		}
	});

	//###########################################################
	// east Region --> behat syntax panel
	//###########################################################
	var behatSyntax	= Ext.create('Ext.grid.Panel', {
		title: 'Behat Syntax',
		id: 'behatSyntax',
		store: wordStore,
		region: 'east',
		width: 605,
		collapsible: true,
		collapsed: true,
		split: true,
		autoScroll: true,
		maxHeight: 1080,
		selType : 'rowmodel',
		columns: [{
				header: 'Code',
				dataIndex: 'code',
				width: 585
			}
		],
		listeners: {
			itemdblclick: function() { // insert selected entry on dbl click!
				if (typeof editor !== 'undefined') {
					selectedEntry	= behatSyntax.getSelectionModel().getSelection()[0].data.code;
					var pos			= editor.getCursorPosition();
					var rowValue	= editor.getSession().getLine(pos.row);

					if (rowValue.indexOf('And') == -1) {
						var isAnd	= false;
					} else if (rowValue.indexOf('And') <= 4) {
						var isAnd	= true;
						rowValue	= rowValue.replace("And", "");
					}
					if (isAnd) {
						selectedEntry	= selectedEntry.substr(selectedEntry.indexOf(" ") + 1);
					}
					editor.insert(selectedEntry);
					autoCoWindow.hide();
					searchNeedle(null);
				}
			}
		},
		bbar:[{
			xtype: 'textfield',
			id: 'filterSyntax',
			width: 250,
			hideLabel: true,
			emptyText: 'search...',
			listeners: {
				'change': function() {
					Ext.getCmp('clearSyntaxFilter').enable();
					wordStore.clearFilter();

					if (this.value.length > 3) {
						var regExp	= new RegExp(this.value.trim());
						wordStore.filter('code', regExp);
					} else if (this.value.length == 0) {
						Ext.getCmp('clearSyntaxFilter').disable();
					}
				}
			}
		},{
			cls: 'x-btn-icon',
			id: 'clearSyntaxFilter',
			icon: 'icons/cross.png',
			disabled: true,
			tooltip: 'clears the syntax filter',
			handler: function() {
				Ext.getCmp('filterSyntax').setValue('');
				wordStore.clearFilter();
				Ext.getCmp('clearSyntaxFilter').disable();
			}
		}]
	});

	//#######################################################################################
	// the toolbar buttons
	//#######################################################################################
	var createFolderButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		icon: 'icons/folder_add.png',
		tooltip: '<b>new Folder</b>',
		clickEvent: 'mousedown',
		handler: function() {
			Ext.MessageBox.prompt('Create Folder', 'please enter folder name:', function(btn, text) {
				if (btn == 'ok') {
					Ext.Ajax.request({
						url: 'ajax_behat.php',
						method: 'post',
						params: {
							route: 'createFolder',
							folderName: text
						},
						success: function(response) {
							var answer	= response.responseText;
							if (answer !== 'Folder '+text+' created.') {
								Ext.MessageBox.show({
									title: 'Status',
									msg: answer,
									buttons: Ext.MessageBox.OK,
									icon: Ext.MessageBox.WARNING
								});
							}
							store.load();
						}
					})
				}//if btn == ok END
			})
		}
	});

	var newFileButton	= Ext.create('Ext.Button', {
		id: 'newFileButton',
		cls: 'x-btn-icon',
		icon: 'icons/application_form_add.png',
		tooltip: '<b>new File</b>',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			var selectedNode	= tree.getSelectionModel().getSelection();
			if (tree.getSelectionModel().hasSelection() && !selectedNode[0].isLeaf()) {
				Ext.MessageBox.prompt('Create File', 'please enter file name:', function(btn, fileName) {
					var selectedFolder	= selectedNode[0];
					var path			= store.getNodeById(selectedNode[0].getId()).getPath();
					if (btn == 'ok') {
						Ext.Ajax.request({
							url: 'ajax_behat.php',
							method: 'post',
							params: {
								route: 'createFile',
								fileName: fileName,
								folder: selectedFolder.data.text
							},
							success: function(response) {
								if (response.responseText.match(/Error/) != null) {
									Ext.MessageBox.show({
										title: 'Error',
										msg: response.responseText,
										buttons: Ext.MessageBox.OK,
										icon: Ext.MessageBox.WARNING
									});
								}
								tree.getStore().load();
								tree.on('load', function() {
									tree.expandPath(path);
								});
								tree.selectPath(path+'/'+response.responseText);
							}
						})
					} // end If btn == ok
				}) // end Ext.MessageBox.prompt
			} else {
				Ext.MessageBox.show({
					title: 'Status',
					msg: 'Please select a folder!',
					buttons: Ext.MessageBox.OK,
					icon: Ext.MessageBox.INFO
				});
			}
		}
	});

	var deleteButton	= Ext.create('Ext.Button', {
		id: 'deleteButton',
		cls: 'x-btn-icon',
		icon: 'icons/delete_icon.png',
		tooltip: '<b>delete</b>',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			if (tree.getSelectionModel().hasSelection()) {
				var selectedNode	= tree.getSelectionModel().getSelection();
				var isFile			= selectedNode[0].isLeaf();
				Ext.MessageBox.show({
					title: 'Delete File/Folder?',
					msg: 'Would you like to delete '+selectedNode[0].data.text+'?',
					buttons: Ext.Msg.YESNO,
					icon: Ext.Msg.WARNING,
					fn: function(btn) {
						if (btn == 'yes') {
							Ext.Ajax.request({
								url: 'ajax_behat.php',
								method: 'post',
								params: {
									route: 'deleteContent',
									name: selectedNode[0].data.text,
									id: selectedNode[0].data.id,
									isFile: isFile
								},
								success: function(response) {
									var answer	= response.responseText;

									if (answer == 'deleted') {
										store.load();
										// find the deleted tab
										for (var j = 0; j < tabPanel.items.items.length; j++) {
											if (selectedNode[0].data.text == tabPanel.items.items[j].title) {
												var tabId	= tabPanel.items.items[j].id;
											}
										}
										// remove deleted tab from the panel
										tabPanel.remove(Ext.getCmp(tabId));

										//deactivate the buttons if there are no tabs left
										if (tabPanel.items.length === 0) {
											disableButtons();
										}
									} else {
										Ext.MessageBox.show({
											title: 'Status',
											msg: answer,
											buttons: Ext.MessageBox.OK,
											icon: Ext.MessageBox.WARNING
										});
									}
								}
							})//ajax end
						}//if btn==yes end
					}
				})
			} else {
				Ext.MessageBox.show({
					title: 'Status',
					msg: 'nothing selected for deletion.',
					buttons: Ext.Msg.OK,
					icon: Ext.Msg.WARNING
				});
			}
		}
	});

	var saveButton	= Ext.create('Ext.Button', {
		id: 'saveButton',
		cls: 'x-btn-icon',
		tooltip: '<b>Save File</b>',
		icon: 'icons/script_save.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			saveMask.show();
			Ext.Ajax.request({
				url: 'ajax_behat.php',
				method: 'post',
				params: {
					route: 'saveFile',
					id: getFileId(tabPanel.getActiveTab().id),
					fileName : tabPanel.getActiveTab().title,
					content: editor.getSession().getValue()
				},
				success: function(response) {
					var answer	= response.responseText;
					if (answer !== 'File saved successfully!') {
						Ext.MessageBox.show({
							title: 'Status',
							msg: answer,
							buttons: Ext.MessageBox.OK,
							icon: Ext.MessageBox.WARNING
						});
					}
					editor.getSession().getUndoManager().reset();
					saveMask.hide();
					editorFocus();
					tabPanel.doLayout();
				}
			})
		}
	});

	// the reload file button
	var reloadFileButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		id: 'reloadFile',
		tooltip: '<b>Reload File</b>',
		icon: 'icons/arrow_refresh.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			loadMask.show();
			Ext.Ajax.request ({
				url: 'ajax_behat.php',
				method: 'post',
				params: {
					route: 'openFile',
					file: getFileId(tabPanel.getActiveTab().id),
					name: tabPanel.getActiveTab().title
				},
				success: function(response) {
					var answer	= response.responseText;
					editor.getSession().setValue(answer);
					enableButtons();
					loadMask.hide();
					editor.focus();
					editor.navigateFileEnd();
				}
			})
		} //handler END
	});

	// the undo button
	var undoButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		id: 'undo',
		tooltip: '<b>Undo</b>',
		icon: 'icons/arrow_undo.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			editor.getSession().getUndoManager().undo(true);
		} //handler END
	});

	// the redo button
	var redoButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		id: 'redo',
		tooltip: '<b>Redo</b>',
		icon: 'icons/arrow_redo.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			editor.getSession().getUndoManager().redo(true);
		} //handler END
	});

	// cut text button
	var cutTextButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		id: 'cutTextButton',
		tooltip: '<b>Cut</b>',
		icon: 'icons/cut.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			if (! editor.getSelection().isEmpty()) {
				clipboard	= editor.getCopyText();
				editor.getSession().remove(editor.getSelection().getRange());
			} else {
				clipboard	= editor.getSession().getLine(editor.getCursorPosition().row).trim();
				var line	= editor.getCursorPosition().row;
				editor.getSession().getDocument().removeLines(line, line);
			}
		} //handler END
	});

	// copy text button
	var copyTextButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		id: 'copyTextButton',
		tooltip: '<b>Copy</b>',
		icon: 'icons/copy.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			if (! editor.getSelection().isEmpty()) {
				clipboard	= editor.getCopyText();
			} else {
				clipboard	= editor.getSession().getLine(editor.getCursorPosition().row).trim();
			}
		} //handler END
	});

	// paste text button
	var pasteTextButton	= Ext.create('Ext.Button', {
		cls: 'x-btn-icon',
		id: 'pasteTextButton',
		tooltip: '<b>Paste</b>',
		icon: 'icons/paste.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			if (clipboard !== null) {
				editor.insert(clipboard, true);
			}
		} //handler END
	});

	// the run Test button, divided in 1.run complete test and 2.run only marked part
	var runTestButton	= Ext.create('Ext.button.Split', {
		tooltip: '<b>run Test</b>',
		cls: 'x-btn-icon',
		id: 'runTest',
		icon: 'icons/control_play_blue.png',
		disabled: true,
		clickEvent: 'mousedown',
		handler: function() {
			testMask.show();
			Ext.Ajax.request({
				url: 'ajax_behat.php',
				method: 'post',
				params: {
					route: 'runTest',
					outputFormat: behatSettings.output,
					useColors: behatSettings.useColors,
					hidePaths: behatSettings.hidePaths,
					content: editor.getSession().getValue()
				},
				success: function(response) {
					var answer	= response.responseText;
					Ext.create('Ext.window.Window', {
						title: 'Test Result: '+tabPanel.getActiveTab().title,
						animCollapse: true,
						collapsible: true,
						maximizable: true,
						autoScroll: true,
						height: 250,
						width: 600,
						layout: 'fit',
						html: '<pre>'+answer+'</pre>'
					}).show();

					testMask.hide();
				}
			})
		},
		menu: {
			items: [{
				text: '...selection only',
				tooltip: '<b>selection only</b><br />Click on a "Scenario:" to mark the line and then click here.',
				id: 'runTestSelected',
				icon: 'icons/control_play_blue.png',
				disabled: true,
				handler: function() {
					testMask.show();
					Ext.Ajax.request({
						url: 'ajax_behat.php',
						method: 'post',
						params: {
							route: 'runTest',
							outputFormat: behatSettings.output,
							useColors: behatSettings.useColors,
							hidePaths: behatSettings.hidePaths,
							content: editor.getSession().getValue(),
							selected: editor.getSelection().isEmpty() ? null : editor.getSession().getTextRange(editor.getSelectionRange()),
							selectionOnly: true
						},
						success: function(response) {
							var answer	= response.responseText;
							Ext.create('Ext.window.Window', {
								title: 'Test Result: '+tabPanel.getActiveTab().title,
								animCollapse: true,
								collapsible: true,
								maximizable: true,
								autoScroll: true,
								height: 250,
								width: 600,
								layout: 'fit',
								html: '<pre>'+answer+'</pre>'
							}).show();

							testMask.hide();
						}
					})
				}
			}]
		}
	});

	// opens the settings window
	var settingsButton	= Ext.create('Ext.Button', {
		id: 'settingsButton',
		tooltip: '<b>Settings</b>',
		icon: 'icons/wrench.png',
		clickEvent: 'mousedown',
		handler: function() {
			settingsWindow.show();
		} //handler END
	});

	// option to set editor to read only mode
	var readOnlyButton	= Ext.create('Ext.Button', {
		id: 'readOnlyButton',
		pressed: false,
		icon: 'icons/lock_open.png',
		tooltip: '<b>lock editor</b>',
		disabled: true,
		enableToggle: true,
		toggleHandler: function(item, pressed) {
			if (pressed) {
				item.setIcon('icons/lock.png');
				item.setTooltip('<b>unlock editor</b>');
				editor.setReadOnly(true);
			} else {
				item.setIcon('icons/lock_open.png');
				item.setTooltip('<b>lock editor</b>');
				editor.setReadOnly(false);
			}
		}
	});

	// the textfield for searching in the open file
	var searchText	= Ext.create('Ext.form.field.Text', {
		id: 'searchText',
		tooltip: '<b>search through open feature file</b>',
		emptyText: 'search...',
		disabled: true,
		hideLabel: true,
		listeners: {
			'change': function() {
				if (this.value.length > 2) {
					editor.navigateFileStart();
					editor.find(this.getValue());
				}
			},
			'specialkey': function(f,e) {
				if (e.getKey() == e.ENTER) {
					editor.findNext();
				}
				if (e.getKey() == e.ESC) {
					this.setValue('');
					editorFocus();
				}
				if (e.getKey() == e.BACKSPACE) {
					editor.navigateFileStart();
					editor.find(searchText.getValue());
				}
			}
		}
	});

	//#######################################################################################
	// the header, top panel containing title and the menu with all available options
	//#######################################################################################
	var menu	= Ext.create('Ext.panel.Panel', {
		region: 'north',
		title: 'Behace - A Behat Test Editor',
		tbar: [
			createFolderButton,
			newFileButton,
			deleteButton,
			"-",
			saveButton,
			reloadFileButton,
			"-",
			undoButton,
			redoButton,
			"-",
			cutTextButton,
			copyTextButton,
			pasteTextButton,
			"-",
			runTestButton,
			"-",
			readOnlyButton,
			"-",
			settingsButton,
			"-",
			"->",
			searchText
		]
	});

	//###########################################################
	// THE SETTINGS WINDOW
	//###########################################################
	var settingsWindow	= Ext.create('Ext.window.Window', {
		id: 'settings',
		closeAction: 'hide',
		border: true,
		closable: true,
		draggable: true,
		resizable: false,
		autoScroll: false,
		height: 450,
		width: 300,
		layout: {
			type: 'fit',
			padding: 5
		},
		items:[{
			xtype: 'tabpanel',
			items: [{
					title: 'Editor Settings',
					rtl: false,
					padding: 10,
					items: [{
						xtype: 'combobox',
						id: 'themeListComboBox',
						fieldLabel: 'Theme',
						allowBlank: false,
						typeAhead: true,
						forceSelection: true,
						emptyText: 'textmate',
						store: themeList,
						valueField: 'name',
						displayField: 'theme',
						listeners: {
							'select': function(field, data) {
								var value	= data[0].data.name;
								editorSettings.theme	= value;
								if (typeof(editor) !== 'undefined') {
									editor.setTheme("ace/theme/"+value);
								}
							}
						}
					},{
						xtype: 'numberfield',
						fieldLabel: 'Text Size',
						anchor: '100%',
						value: 12,
						minValue: 8,
						maxValue: 24,
						steps: 1,
						listeners: {
							change: function(field, value) {
								value = parseInt(value);
								field.setValue(parseInt(value));
								editorSettings.fontSize	= value;
								if (typeof(editor) !== 'undefined') {
									editor.setFontSize(value);
								}
							}
						}
					},{
						xtype: 'numberfield',
						fieldLabel: 'Tab Size',
						anchor: '100%',
						value: 4,
						minValue: 1,
						maxValue: 8,
						steps: 1,
						listeners: {
							change: function(field, value) {
								value = parseInt(value);
								field.setValue(parseInt(value));
								editorSettings.tabSize	= value;
								if (typeof(editor) !== 'undefined') {
									editor.getSession().setTabSize(value);
								}
							}
						}
					}, {
						xtype: 'checkbox',
						id: 'useTabs',
						fieldLabel: 'Use Soft Tabs',
						checked : editorSettings.softTabs,
						listeners: {
							change: function(field, value) {
								var tabStatus	= Ext.getCmp('useTabs').getValue();
								editorSettings.softTabs	= value;

								if (typeof(editor) !== 'undefined') {
									editor.getSession().setUseSoftTabs(tabStatus);
								}
							}
						}
					}, {
						xtype: 'checkbox',
						id: 'useWrap',
						fieldLabel: 'Use Soft Wrap',
						checked : editorSettings.wrapMode,
						listeners: {
							change: function(field, value) {
								var tabStatus	= Ext.getCmp('useWrap').getValue();
								editorSettings.wrapMode	= value;

								if (typeof(editor) !== 'undefined') {
									editor.getSession().setUseWrapMode(tabStatus);
								}
							}
						}
					}, {
						xtype: 'checkbox',
						id: 'lineHighlight',
						fieldLabel: 'Use Line Highlighting',
						checked : editorSettings.lineHighlight,
						listeners: {
							change: function(field, value) {
								var tabStatus	= Ext.getCmp('lineHighlight').getValue();
								editorSettings.lineHighlight	= value;

								if (typeof(editor) !== 'undefined') {
									editor.setHighlightActiveLine(tabStatus);
								}
							}
						}
					}, {
						xtype: 'checkbox',
						id: 'printMargin',
						fieldLabel: 'Use Print Margin',
						checked : editorSettings.printMargin,
						listeners: {
							change: function(field, value) {
								var tabStatus	= Ext.getCmp('printMargin').getValue();
								editorSettings.printMargin	= value;

								if (typeof(editor) !== 'undefined') {
									editor.setShowPrintMargin(tabStatus);
								}
							}
						}
					}]
				}, {
					title: 'Behat Settings',
					rtl: false,
					padding: 10,
					items: [{
						xtype: 'combobox',
						id: 'behatOutputListComboBox',
						fieldLabel: 'Output Format:',
						allowBlank: false,
						forceSelection: true,
						emptyText: 'pretty',
						store: behatOutputList,
						valueField: 'name',
						displayField: 'output',
						listeners: {
							'select': function(field, data) {
								behatSettings.output	= data[0].data.name;
							}
						}
					}, {
						xtype: 'checkbox',
						id: 'useColors',
						fieldLabel: 'use Colors',
						checked : behatSettings.useColors,
						listeners: {
							change: function(field, value) {
								behatSettings.useColors	= value;
							}
						}
					}, {
						xtype: 'checkbox',
						id: 'hidePaths',
						fieldLabel: 'hide Paths',
						checked : behatSettings.hidePaths,
						listeners: {
							change: function(field, value) {
								behatSettings.hidePaths	= value;
							}
						}
					}]
				}
			]
		}]
	});
	// selecting a default value for the combobox
	themeList.on('load',function(store) {
		Ext.getCmp('themeListComboBox').setValue(store.getAt('0').get('name'));
	});
	// selecting a default value for the behat output format
	behatOutputList.on('load',function(store) {
		Ext.getCmp('behatOutputListComboBox').setValue(store.getAt('0').get('name'));
	});

	//###########################################################
	// THE VIEWPORT
	//###########################################################
	Ext.create('Ext.container.Viewport', {
		layout:'border',
		items: [
			tabPanel,
			behatSyntax,
			menu,
			tree,
			{
				region: 'south',
				xtype: 'panel',
				height: 20,
				title: 'icons by <a target="_blank" href="http://www.famfamfam.com">famfamfam.com</a>'
			}]
	});


	//###########################################################
	// KEYMAPS
	//###########################################################
	// Keymaps attached to Body()
	var bodyMapping	= new Ext.util.KeyMap(Ext.getBody(), [{
		key: Ext.EventObject.ENTER,
		fn: function(key, e) {
			if (Ext.getCmp('autoCoGrid').getSelectionModel().hasSelection()) {
				insertSelectedSentence(e);
			}
			if (Ext.getCmp('regExGrid').getSelectionModel().hasSelection()) {
				e.preventDefault();
				editor.find(needlePos[searchPos], {
					backwards: false,
					skipCurrent: false,
					range: editor.getSelection().getLineRange()
				});
				editor.replace(Ext.getCmp('regExGrid').getSelectionModel().getSelection()[0].data.option);
				regExWindow.hide();
				regExStore.removeAll();
				editor.focus();
				// check if RegEx contains variables, if true: start search all over again, for better workflow
				if (needlePos[searchPos].match(/%/g) != null) {
					cleanUp();
					searchNeedle(null);
				} else {
					goToNextVariable();
				}
			}
		}},
		{ //Had to implement UP and DOWN for "noFocus" grid change in autocomplete window
			key: Ext.EventObject.DOWN,
			fn: function() {
				var autoCoGrid	= Ext.getCmp('autoCoGrid');
				var regExGrid	= Ext.getCmp('regExGrid');

				if (! autoCoWindow.isHidden()) {
					if (autoCoGrid.getSelectionModel().getSelection()[0].index < autoCoStore.getCount()-1) {
						autoCoGrid.getSelectionModel().select(autoCoGrid.getSelectionModel().getSelection()[0].index+1);
					} else {
						autoCoGrid.getSelectionModel().select(0);
					}
				}

				if (! regExWindow.isHidden()) {
					if (! regExGrid.getSelectionModel().hasSelection()) {
						regExGrid.getSelectionModel().select(0);
					} else {
						regExGrid.getSelectionModel().selectNext();
					}
				}
				editor.focus();
			}

		},
		{
			key: Ext.EventObject.UP,
			fn: function() {
				var autoCoGrid	= Ext.getCmp('autoCoGrid');
				var regExGrid	= Ext.getCmp('regExGrid');

				if (! autoCoWindow.isHidden()) {
					if (autoCoGrid.getSelectionModel().getSelection()[0].index > 0) {
						autoCoGrid.getSelectionModel().select(autoCoGrid.getSelectionModel().getSelection()[0].index-1)
					} else {
						autoCoGrid.getSelectionModel().select(autoCoStore.getCount()-1);
					}
				}

				if (! regExWindow.isHidden()) {
					regExGrid.getSelectionModel().selectPrevious();
				}
				editor.focus();
			}
		},
		{
			key: Ext.EventObject.TAB,
			handler: function(key, e) {
				e.preventDefault();
				goToNextVariable();
			}
		},
		{
			key: Ext.EventObject.ESC,
			fn: cleanUp
		}
	]);

	// ESC Option for deleting the search
	var closeTree	= new Ext.util.KeyMap(Ext.get('filterTree'), [
		{
		key: Ext.EventObject.ESC,
		fn: function() {
				treeFilter.clearFilter();
				tree.collapseAll();
				Ext.getCmp('filterTree').setValue('');
				Ext.getCmp('clearFilter').disable();
			}
		}
	]);

	// ESC Option for deleting the search
	var closeSyntax	= new Ext.util.KeyMap(Ext.get('filterSyntax'), [
		{
		key: Ext.EventObject.ESC,
		fn: function() {
				wordStore.clearFilter();
				Ext.getCmp('filterSyntax').setValue('');
			}
		}
	]);
});