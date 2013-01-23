//####################################
//REQUIRES
//####################################
Ext.Loader.setPath('Ext.ux', '.');
Ext.require([
	'Ext.ux.TreeFilter'
])

//####################################
//INITS
//####################################

//contains all open editors and open files connected to the open tabs in an 'associative array'
var editorBib	= new Array();
editorBib[0]	= new Object();
editorBib[1]	= new Object();

var treeFilter	= Ext.create('Ext.ux.TreeFilter');

//####################################
//FUNCTIONS
//####################################

/*
 * filters the associated line for %value, %type or %number and saves it in an array. Thereafter starts searching the first occurrence
 */
function searchNeedle() {
	editorFocus();

	var pos				= editor.selection.getCursor();
	rowValue			= editor.session.getLine( pos.row );
	window.searchPos	= 0;
	window.needlePos	= rowValue.split( ' ' );
	window.isSearch		= true;

	for( var k = needlePos.length-1; k >= 0; k-- ) {

		if( needlePos[k].match( /%/ ) == null ) {
			needlePos.splice( k, 1 );

		} else {
			needlePos[k]	= needlePos[k].replace( /"/g, '' );
		}
	}
	
	if( needlePos.length !== 0 ) {
		editor.commands.removeCommand( 'indent' );
		editor.commands.removeCommand( 'outdent' );
		editor.find( needlePos[searchPos] );
	}
}

/*
 * focuses the editor, clears the syntax panel on the right and collapses it
 */
function editorFocus() {
	wordStore.clearFilter();
	editor.focus();
}

/*
 * disables the buttons 
 */
function disableButtons() {
	Ext.getCmp( 'saveButton' ).disable();
	Ext.getCmp( 'runTest' ).disable();
	Ext.getCmp( 'reloadFile' ).disable();
}

/*
 * enables the buttons 
 */
function enableButtons() {
	Ext.getCmp( 'saveButton' ).enable();
	Ext.getCmp( 'runTest' ).enable();
	Ext.getCmp( 'reloadFile' ).enable();
}

/*
 * creates an editor with basic settings, connects it to the created tab and saves it to editorBib
 */
function editorFactory( elId, fileId ) {
	var editor	= ace.edit( elId );
	editor.setTheme( "ace/theme/textmate" );
	editor.getSession().setMode( 'ace/mode/behat' );
	editor.getSession().setTabSize( 4 );
	editor.getSession().setUseSoftTabs( false );
	editor.setShowPrintMargin( false );
	editor.setFontSize( 26 );

	editorBib[0][elId]	= editor;
	editorBib[1][elId]	= fileId;
}

/*
 * returns the editor based on the elId (the chosen tab) 
 */
function getEditor( elId ) {
	return editorBib[0][elId];
}

/*
 * returns the editor based on the elId (the chosen tab) 
 */
function getFileId( elId ) {
	return editorBib[1][elId];
}

/*
 * destroys the editor after closing the associated tab
 */
function destroyEditor( elId ) {
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
		exec: function(editor, args) { editor.navigateDown(args.times); },
		multiSelectAction: "forEach",
		readOnly: true
	});
	
	editor.commands.addCommand({
		name: "golineup",
		bindKey: { win:"Up", mac: "Up" },
		exec: function(editor, args) { editor.navigateUp(args.times); },
		multiSelectAction: "forEach",
		readOnly: true
	})
}

function addTabCommand() {
	editor.commands.addCommand({
		name: "indent",
		bindKey: {win: "Tab", mac: "Tab" },
		exec: function(editor) { editor.indent(); },
		multiSelectAction: "forEach"
	});
	editor.commands.addCommand({
		name: "outdent",
		bindKey: {win:"Shift-Tab", mac: "Shift-Tab"},
		exec: function(editor) { editor.blockOutdent(); },
		multiSelectAction: "forEach"
	});
}

//###############################
//STORES
//###############################

var store	= Ext.create('Ext.data.TreeStore', {
	proxy: {
		type: 'ajax',
		url: 'ajax_behat.php?route=getDirList'
	},
	folderSort: true,
	autoLoad: true,
	sorters: [{property: 'text', direction: 'ASC'}]
});

var wordStore = Ext.create('Ext.data.Store', {
	storeId : 'behatSyntaxStore',
	fields: ['code', 'group'],
	autoLoad : true,
	sortOnFilter: true,
	proxy: {
		type : 'ajax',
		url  : 'ajax_behat.php?route=getSyntaxList',
		reader: {
			type : 'json',
			root : 'items'
		}
	},
	groupers:[{ property: 'group', direction: 'ASC' }]
});

var autoCoStore = Ext.create('Ext.data.Store', {
	storeId : 'behatSyntaxStore',
	fields: ['code'],
	autoLoad : true,
	sortOnFilter: true,
	proxy: {
		type : 'ajax',
		url  : 'ajax_behat.php?route=getSyntaxList',
		reader: {
			type : 'json',
			root : 'items'
		}
	},
	sorters:[{ property: 'code', direction: 'ASC' }]
});

//####################################
//onREADY
//####################################
Ext.onReady(function(){
	
	var testMask	= new Ext.LoadMask( Ext.getBody(), {msg:"running Test..."} );
	var loadMask	= new Ext.LoadMask( Ext.getBody(), {msg:"loading..."} ); 
	var saveMask	= new Ext.LoadMask( Ext.getBody(), {msg:"saving..."} );

	var tree		= Ext.create('Ext.tree.Panel', {
		title: 'Files',
		collapsible: true,
		width: 225,
		store: store,
		rootVisible: false,
		split: true, 
		sorters: [{property:'text', direction: 'ASC'}],
		region: 'west',
		tbar: [{
			text: 'new Folder',
			xtype: 'button',
			icon: 'icons/folder_add.png',
			handler: function() {
				Ext.MessageBox.prompt('Create Folder', 'please enter folder name:', function( btn, text ) {

					if( btn == 'ok' ) {
						Ext.Ajax.request({
							url: 'ajax_behat.php',
							method: 'post',
							params: {
								route: 'createFolder',
								folderName: text
							},
							success: function( response ) {
								var answer	= response.responseText;

								if( answer == 'directory ' + text +' created.' ) {

								} else {
									Ext.MessageBox.alert( 'Status', answer );
								}
								store.load();
							}
						})
					}//if btn == ok END
				})
			}
		},{
			text: 'new File',
			xtype: 'button',
			icon: 'icons/application_form_add.png',
			handler: function() {
				var selectedNode = tree.getSelectionModel().getSelection();

				if( tree.getSelectionModel().hasSelection() && !selectedNode[0].isLeaf() ) {
					Ext.MessageBox.prompt('Create File', 'please enter file name:', function( btn, fileName ) {
						var selectedFolder	= selectedNode[0];
						var folder			= tree.getSelectionModel().getSelection()[0].getId();

						if( btn == 'ok' ) {
							Ext.Ajax.request({
								url: 'ajax_behat.php',
								method: 'post',
								params: {
									route: 'createFile',
									fileName: fileName,
									folder: selectedFolder.data.text
								},
								success: function( response ) {
									var answer	= response.responseText;

									if( answer == 'file '+fileName+' created.' ) {

									} else {
										Ext.MessageBox.alert( 'Status', answer );
									}
									store.load();
									tree.expandPath( folder );
								}
							})
						} // end If btn == ok
					}) // end Ext.MessageBox.prompt

				} else {
					Ext.MessageBox.alert( 'Status', 'Please select a folder' );
				}
			}
		},{
			text: 'delete',
			xtype: 'button',
			icon: 'icons/delete_icon.png',
			handler: function() {

				if( tree.getSelectionModel().hasSelection() ) {
					var selectedNode	= tree.getSelectionModel().getSelection();
					var isFile			= selectedNode[0].isLeaf();
					Ext.MessageBox.show({
						title: 'Delete File/Folder?',
						msg: 'Would you like to delete '+selectedNode[0].data.text+'?',
						buttons: Ext.Msg.YESNO,
						icon: Ext.Msg.WARNING,
						fn: function( btn ) {

							if( btn == 'yes' ) {
								Ext.Ajax.request({
									url: 'ajax_behat.php',
									method: 'post',
									params: {
										route: 'deleteContent',
										name: selectedNode[0].data.text,
										id: selectedNode[0].data.id,
										isFile: isFile
									},
									success: function( response ) {
										var text	= response.responseText;

										if( text == 'deleted' ) {
											store.load();

											//find the deleted tab
											for( var j = 0; j < tabPanel.items.items.length; j++ ) {

												if( selectedNode[0].data.text == tabPanel.items.items[j].title ) {
													var tabId	= tabPanel.items.items[j].id;
												}
											}
											//remove deleted tab from the panel
											tabPanel.remove( Ext.getCmp( tabId ) );

											//deactivate the buttons if there are no tabs left
											if( tabPanel.items.length === 0 ) {
												disableButtons();
											}

										} else {
											Ext.MessageBox.alert( 'Status', text );
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
		}],
		bbar:[{
			xtype: 'textfield',
			id: 'filterTree',
			tooltip: 'filters the dir tree',
			emptyText: 'search...',
			hideLabel: true,
			listeners: {
				'change': function() {
					treeFilter.init(tree);
					Ext.getCmp( 'clearFilter' ).enable();

					if( this.value.length >= 2 ) {
						treeFilter.filter( this.value );

					} else if( this.value.length == 0 ) {
						treeFilter.clearFilter();
						tree.collapseAll();
					}
				}
			}
		},{
			xtype: 'button',
			id: 'clearFilter',
			tooltip: 'clears the search filter',
			icon: 'icons/arrow_undo.png',
			text: 'clear',
			disabled: true,
			handler: function() {
				treeFilter.init(tree);
				treeFilter.clearFilter();
				tree.collapseAll();
				Ext.getCmp( 'filterTree' ).setRawValue('');
				Ext.getCmp( 'clearFilter' ).disable();
			}
		}],
		listeners: {
			itemclick: function( view, node ) {

				//open nodes with a single click
				if(node.isLeaf()) {

				} else if(node.isExpanded()) {
					node.collapse();

				} else {
					node.expand();
				}
			},
			itemdblclick: {
				fn: function( view, record, item, index, e ) {
					var isOpen	= false;

					window.id		= record.get('id');
					window.title	= record.get('text');

					// check if the file is already open!!!
					for( var j = 0; j < tabPanel.items.items.length; j++ ) {

						if( title == tabPanel.items.items[j].title ) {
							isOpen		= true;
							var tabId	= tabPanel.items.items[j].id;
						}
					}

					if( isOpen ) {
						tabPanel.setActiveTab( tabId );

					} else {
						Ext.Ajax.request ({
							url: 'ajax_behat.php',
							method: 'post',
							params: {
								route: 'openFile',
								file: id,
								name: title
							},
							success: function( response ) {
								var tab	= tabPanel.add({
									title: title,
									closable: true,
									active: true,
									listeners: {
										afterrender:function() {
											editorFactory( this.id, id );
											editor	= getEditor( this.id );
										},
										'beforeclose': function( tab ) {
											destroyEditor( tab.id );
											tab.events.beforeclose.clearListeners();
											tab.close();

											return false;
										}
									}
								})
								tabPanel.setActiveTab( tab );
								var text	= response.responseText;
								editor.getSession().setValue( text );
								enableButtons();
								editor.focus();
								editor.navigateFileEnd();

								//###############################################
								//autocomplete feature
								//###############################################
								editor.on( 'change', function(e) {
									var pos		= editor.getCursorPosition();
									var dispPos	= editor.renderer.textToScreenCoordinates( pos.row, pos.column );

									//show the autocomplete
									window.rowValue	= editor.session.getLine( pos.row );
									rowValue.trim();

									//activation after 4 chars
									if( rowValue.length > 4 ) {
										autoCoStore.clearFilter();
										tabPanel.doLayout();

										if( rowValue.indexOf( 'And' ) == -1 ) {
											window.isAnd	= false;
											var regExp		= new RegExp( rowValue.trim() );

										//if and is written, filter autocomplete by first word one line up
										} else if( rowValue.indexOf( 'And' ) <= 4 ) {
											var row			= editor.getCursorPosition().row;
											window.isAnd	= true;
											rowValue		= rowValue.replace( 'And', '' );
											
											//run up the lines until the editor finds when, then or given! 
											while( row != 1 ) {
												
												if( editor.session.getLine( row ).split(' ')[0].trim() == 'And' ) {
													--row;
													
												} else {
													upperLine	= editor.session.getLine( row ).split(' ')[0].trim();
													row			= 1;
												}
											}
											var regExp	= new RegExp( upperLine+' '+rowValue.trim() );
										}

										autoCoStore.filter( 'code', regExp );
										autoCoWindow.doLayout();

										if( autoCoStore.getCount() !== 0 && e.data.text !== "\n" && rowValue.length <= 20 && rowValue.indexOf('|') == -1 ) {
											
											//positioning the autocomplete window depending on cursor pos
											if  ( ( window.screen.height - dispPos.pageY ) < 250 ) {
												autoCoWindow.showAt( dispPos.pageX-20, dispPos.pageY-100 );
												
											} else {
												autoCoWindow.showAt( dispPos.pageX-20, dispPos.pageY+20 );
											}
											
											Ext.getCmp( 'autoCoGrid' ).getSelectionModel().select(0);
											editor.focus();
											//deactivating commands 'up' and 'down' for 'safety'
											editor.commands.removeCommand( 'golinedown' );
											editor.commands.removeCommand( 'golineup' );

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
								});//editor on END
							}//success END
						})
					}//if isOpen else END
				}
			}
		}
	});

	//###########################################################
	// TAB PANEL
	//###########################################################
	var tabPanel	= Ext.create( 'Ext.tab.Panel', {
		region:'center',
		id: 'tabPanel',
		listeners: {
			'tabchange': function( tabPanel, newCard ) {
				editor	= getEditor( newCard.id );
				editor.focus();
				wordStore.clearFilter();
				autoCoWindow.hide();
			},
			'remove': function( tab, component, eOpts ) {

				if( tabPanel.items.length === 0 ) {
					disableButtons();
				}
				wordStore.clearFilter();
				autoCoWindow.hide();
			}
		}
	})
	
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
		columns: [
			{ header: 'Code',  dataIndex: 'code', width: 585 }
		],
		listeners: {
			itemdblclick: function() { // insert selected entry on dbl click!
				if( typeof editor !== 'undefined' ) {
					selectedEntry	= behatSyntax.getSelectionModel().getSelection()[0].data.code;
					var pos			= editor.getCursorPosition();

					var rowValue	= editor.session.getLine( pos.row );

					if( rowValue.indexOf( 'And' ) == -1 ) {
						var isAnd	= false;

					} else if( rowValue.indexOf( 'And' ) <= 4 ) {
						var isAnd	= true;
						rowValue	= rowValue.replace( "And", "" );
					}

					if( isAnd ) {
						selectedEntry	= selectedEntry.substr( selectedEntry.indexOf( " " ) + 1 );
					}

					editor.insert( selectedEntry );
					autoCoWindow.hide();
					searchNeedle();
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
					Ext.getCmp( 'clearSyntaxFilter' ).enable();
					wordStore.clearFilter();
					
					if( this.value.length > 3 ) {
						var regExp	= new RegExp( this.value.trim() );
						wordStore.filter( 'code', regExp );
						
					} else if( this.value.length == 0 ) {
						Ext.getCmp( 'clearSyntaxFilter' ).disable();
					}
				}
			}
		},{
			xtype: 'button',
			id: 'clearSyntaxFilter',
			icon: 'icons/arrow_undo.png',
			disabled: true,
			text: 'clear',
			handler: function(){
				Ext.getCmp( 'filterSyntax' ).setRawValue('');
				wordStore.clearFilter();
				Ext.getCmp( 'clearSyntaxFilter' ).disable();
			}
		}]
	});
	
	//###########################################################
	//the header, top panel containing title and the menu
	//###########################################################
	var menu	= Ext.create( 'Ext.panel.Panel', {
		region: 'north',
		title: 'Behat Editor',
		height: 53,
		tbar: [
			{
				xtype: 'tbspacer',
				width: 230
			},{
				xtype: 'button',
				text: 'save',
				icon: 'icons/script_save.png',
				id: 'saveButton',
				scale: 'small',
				disabled: true,
				handler: function() {
					saveMask.show();

					Ext.Ajax.request({
						url: 'ajax_behat.php',
						method: 'post',
						params: {
							route: 'saveFile',
							id: getFileId( tabPanel.getActiveTab().id ),
							fileName : tabPanel.getActiveTab().title,
							content: editor.getSession().getValue()
						},
						success: function( response ) {
							saveMask.hide();
							editorFocus();
							tabPanel.doLayout();
						}
					})
				}
			},{
				xtype: 'button',
				text: 'run Test',
				id: 'runTest',
				icon: 'icons/control_play_blue.png',
				disabled: true,
				scale: 'small',
				handler: function() {
					
					testMask.show();

					Ext.Ajax.request({
						url: 'ajax_behat.php',
						method: 'post',
						params: {
							route: 'runTest',
							content: editor.getSession().getValue()
						},
						success: function(response) {
							Ext.create('Ext.window.Window', {
								title: 'Test Result: '+tabPanel.getActiveTab().title,
								autoScroll: true,
								height: 250,
								width: 600,
								layout: 'fit',
								html: '<pre>'+response.responseText+'</pre>'
							}).show();

							testMask.hide();
						}
					})
				}
			},{
				xtype: 'button',
				text: 'reload',
				id: 'reloadFile',
				icon: 'icons/arrow_refresh.png',
				disabled: true,
				scale: 'small',
				handler: function( view, record, item, index, e ) {

					loadMask.show();
					Ext.Ajax.request ({
						url: 'ajax_behat.php',
						method: 'post',
						params: {
							route: 'openFile',
							file: getFileId( tabPanel.getActiveTab().id ),
							name: tabPanel.getActiveTab().title
						},
						success: function( response ) {
							var text	= response.responseText;
							editor.getSession().setValue( text );
							enableButtons();
							loadMask.hide();
							editor.focus();
							editor.navigateFileEnd();
						}
					})
				} //handler END
			}
		]
	})	
		
	//###########################################################
	//statusbar
	//###########################################################
	var tBarText	= Ext.create( 'Ext.toolbar.TextItem', {
		text: 'icons by http://www.famfamfam.com/'
	})

	//###########################################################
	// THE VIEWPORT
	//###########################################################
	Ext.create('Ext.container.Viewport', {
		layout:'border',
		items: [tabPanel, behatSyntax, menu, tree,
		{
			region: 'south',
			title: 'Credits',
			xtype: 'panel',
			collapsible: true,
			collapsed: true,
			height: 50,
			tbar: [tBarText]
		}]
	});
	
	//###########################################################
	// THE AUTOCOMPLETE WINDOW
	//###########################################################
	var autoCoWindow	= Ext.create( 'Ext.window.Window', {
		id: 'autoComplete',
		layout: 'card',
		border: false,
		closable: false,
		draggable: false,
		resizable:false,
		autoScroll: true,
		height: 100,
		width: 450,
		defaultFocus: menu,
		items:[{
			xtype: 'grid',
			id: 'autoCoGrid',
			border: false,
			hideHeaders: true,
			forceFit: true,
			columns: [{header: 'code', dataIndex: 'code' }],
			store: autoCoStore
		}]
	});

	//###########################################################
	//KEYMAPS
	//###########################################################
	
	// Keymaps attached to Body()
	var bodyMapping	= new Ext.util.KeyMap( Ext.getBody(), [
		{
		key: Ext.EventObject.ENTER,
		fn: function( key, e ) {
			
				if( Ext.getCmp('autoCoGrid').getSelectionModel().hasSelection() ) {

					selectedEntry	= Ext.getCmp('autoCoGrid').getSelectionModel().getSelection()[0].data.code;
					rowValue		= rowValue.trim();

					if( !isAnd ) {
						selectedEntry	= selectedEntry.substr( rowValue.length );

					} else {
						selectedEntry	= selectedEntry.substr( selectedEntry.indexOf( " " ) + 1 );
						selectedEntry	= selectedEntry.substr( rowValue.length );
					}

					e.preventDefault();
					editor.insert( selectedEntry );
					searchNeedle();
					
					autoCoWindow.hide();
					autoCoStore.clearFilter();
					Ext.getCmp( 'autoCoGrid' ).getSelectionModel().clearSelections();
					addCommand();
				}
			}
		},
		{ //Had to implement UP and DOWN for "noFocus" grid change in autocomplete window
			key: Ext.EventObject.DOWN,
			fn: function() {
				var autoCoGrid	= Ext.getCmp( 'autoCoGrid' );
				
				if( !autoCoWindow.isHidden() && autoCoGrid.getSelectionModel().getSelection()[0].index < autoCoStore.getCount()-1 ) {
					autoCoGrid.getSelectionModel().select( autoCoGrid.getSelectionModel().getSelection()[0].index+1 );
					
				} else {
					autoCoGrid.getSelectionModel().select(0);
				}
			}
		},
		{
			key: Ext.EventObject.UP,
			fn: function() {
				var autoCoGrid	= Ext.getCmp( 'autoCoGrid' );
				
				if( !autoCoWindow.isHidden() && autoCoGrid.getSelectionModel().getSelection()[0].index > 0) {
					autoCoGrid.getSelectionModel().select( autoCoGrid.getSelectionModel().getSelection()[0].index-1 )
				} else {
					autoCoGrid.getSelectionModel().select( autoCoStore.getCount()-1 );
				}
			}
		},
		{
		key: Ext.EventObject.TAB,
		handler: function( key, e ) {
				e.preventDefault();

				if( searchPos < needlePos.length ) {
					searchPos++;
					editor.find( needlePos[searchPos], {
						backwards: false
					});
				}
				
				if( searchPos+1 == needlePos.length ) {
					addTabCommand();
				}
				editor.focus();
			}
		},
		{
		key: Ext.EventObject.ESC,
		fn: function() {
				Ext.getCmp( 'autoCoGrid' ).getSelectionModel().clearSelections();
				autoCoWindow.hide();
				autoCoStore.clearFilter();
				editor.focus();
				addCommand();
				addTabCommand();
			}
		},
		{
		// todo: not fully functional at the moment
		key: Ext.EventObject.TAB, 
		shift: true,
		handler: function( key, e ) {
				
				e.preventDefault();
				
				if( searchPos > 0 ) {
					--searchPos; 
					editor.find( needlePos[searchPos],  {
						backwards: true
					});
				}
			}
		}
	]);

	// ESC Option for deleting the search
	var closeTree	= new Ext.util.KeyMap( Ext.get( 'filterTree' ), [
		{
		key: Ext.EventObject.ESC,
		fn: function(){ 
				treeFilter.clearFilter();
				tree.collapseAll();
				Ext.getCmp( 'filterTree' ).setRawValue('');
				Ext.getCmp( 'clearFilter' ).disable();
			}
		}
	]);

	// ESC Option for deleting the search
	var closeSyntax	= new Ext.util.KeyMap( Ext.get( 'filterSyntax' ), [
		{
		key: Ext.EventObject.ESC,
		fn: function() {
				wordStore.clearFilter();
				Ext.getCmp( 'filterSyntax' ).setRawValue('');
			}
		}
	]);
});