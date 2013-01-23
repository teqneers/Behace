<?php
error_reporting( E_ALL );

###################################################
# INCLUDES
###################################################
include_once '../local_config.php';

###################################################
# FUNCTIONS
###################################################
function getFilePath( $open ) {
	$dirTree	= new RecursiveDirectoryIterator( PATHTOBEHAT."features", RecursiveDirectoryIterator::SKIP_DOTS );
	$dir		= array();

	foreach( $dirTree as $path ) {

		foreach( new DirectoryIterator( $path ) as $file ) {

			if( !$file->isDot()
				&& $file->__toString() !== 'bootstrap'
				&& $file->__toString() !== 'db'
				&& strpos( $file->__toString(), '.feature' ) !== false ) {

				$dir[]	= array( 'text'=>$file->getFilename(), 'path'=>$file->getPath(), 'id'=>sha1($file->getPathname()) );
			}
		}
	}

	foreach( $dir as $k=>$v ) {

		if( $v['id'] == $open ) {
			$filePath	= $v['path'];
		}
	}
	return $filePath;
}

function procOpenBehat( $cmd ) {
	$descriptorspec	= array(
		0 => array("pipe", "r"),
		1 => array("pipe", "w")
	);
	$process	= proc_open( $cmd, $descriptorspec, $pipes, PATHTOBEHAT );

	if ( is_resource( $process ) ) {
		fwrite( $pipes[0], $cmd );
		fclose( $pipes[0] );
	}
	$shOutput	= explode( '$/', stream_get_contents( $pipes[1] ) );
	fclose( $pipes[1] );
	
	return $shOutput;
}


//switch depending on the route given
switch( $_REQUEST['route'] ) {

	case 'getSyntaxList':
		
		$cmd	= './bin/behat -dl';
		$shOutput	= procOpenBehat( $cmd );
		
		$syntaxFilter	= array( '(\d+)', '(.*)', '(\w+)', '</comment>' );
		$replaceFilter	= array( '%number', '%type', '%type', '' );
		
		//cleaning the shell output -> filters from local_config
		foreach( $shOutput as $k=>$v ) {
			$tmp[]	= trim( preg_replace( '/[.\[\]$\*\\\\+\/\^]/', '', str_replace('^"','', str_replace( $syntaxFilter, $replaceFilter, $v ) ) ) );
		}

		foreach( $tmp as $k=>$v ) {
			$arr	= explode( ' ', trim( $v ) );
			
			if( $v != '' ) {
				$output['items'][]	= array( 'code'=> preg_replace( '/"([^"]*)"/', '"%value"', $v ) , 'group' =>$arr[0] );
			}
		}
		echo json_encode( $output );
		exit;
		break;

	case 'getDirList':
		$dirTree	= new RecursiveDirectoryIterator( PATHTOBEHAT."features", RecursiveDirectoryIterator::SKIP_DOTS );
		$dir		= array();

		foreach( $dirTree as $path ) {

			//gets the file in the current directory
			foreach( new DirectoryIterator( $path ) as $file ) {

				if( !$file->isDot() && strpos( $file->__toString(), '.feature' ) !== false ) {
					$subDir[]	= array( 'id'=>sha1($file->getPathname()), 'text'=>$file->getFilename(),'leaf'=>true );
				}
			}
			//creates the folder entry and appends the files containing it
			if( $path->getFilename() !== 'bootstrap' && $path->getFilename() !== 'db' && $path->getFilename() !== 'tmp' ) {
				$dir[]	= array( 'id'=>sha1($path->getPathname()), 'text'=>$path->getFilename(), 'leaf'=>false, 'children'=>$subDir );
				$subDir	= array();
			}
		}
		echo json_encode( $dir );
		exit;
		break;

	case 'openFile':
		$id		= $_REQUEST['file'];
		$name	= $_REQUEST['name'];
		$filePath	= getFilePath( $id );
		readfile( $filePath.'/'.$name );
		exit;
		break;

	case 'saveFile':
		$content	= $_REQUEST['content'];
		$open		= $_REQUEST['fileName'];
		$id			= $_REQUEST['id'];

		//creates an array for finding the path to the file to be saved
		$filePath	= getFilePath( $id );

		if( $handle	= fopen( $filePath.'/'.$open, 'w' ) ) {
			fwrite( $handle, $content );
			fclose( $handle );
			echo 'File saved successfully!';

		} else {
			echo 'File could not be saved!';
		}
		exit;
		break;

	case 'createFolder':
		//filter some suspicious charsets for (a little) security
		$folderName	= trim( htmlspecialchars( strtolower( $_REQUEST['folderName'] ) ) );
		$folderName	= str_replace( array( '..', '/' ), '', $folderName );

		//try creating the folder with full rights for reading, writing and opening
		if( !file_exists( PATHTOBEHAT.'features/'.$folderName ) ) {

			if( mkdir( PATHTOBEHAT.'features/'.$folderName, 0777 ) ) {
				echo 'directory '. $folderName .' created.';

			} else {
				echo 'Directory could not be created.';
			}

		} else {
			echo 'folder "'.$folderName.'" already exists!';
		}
		exit;
		break;

	case 'createFile':

		$folderName	= $_REQUEST['folder'];

		//filter some suspicious charsets for (a little) security
		$fileName	= trim( htmlspecialchars( strtolower( $_REQUEST['fileName'] ) ) );
		$fileName	= str_replace( '..', '', $fileName );
		$fileName	= str_replace( '/', '', $fileName );

		//try creating the file with full rights for reading, writing and opening
		if( !file_exists( PATHTOBEHAT.'features/'.$folderName.'/'.$fileName.'.feature' ) ) {
			$handler	= fopen( PATHTOBEHAT.'features/'.$folderName.'/'.$fileName.'.feature', 'w' ) or die( 'File could not be created.' );
			fwrite( $handler, "Feature: featuretext\n\tFeature description\n\nScenario: short scenario-description\n\tGiven \n\tWhen \n\tThen " );
			
			echo 'file '. $fileName .' created.';
			fclose( $handler );

		} else {
			echo 'File "'. $fileName .'.feature" already exists!';
		}
		exit;
		break; 

	case 'runTest':
		//runs the selected test-> writes it in a new file with a tempTest tag!
		$file		= PATHTOBEHAT.'features/tmp/tempTest.feature';
		$content	= strip_tags( str_replace( '..', '', str_replace( '/', '', $_REQUEST['content'] ) ) );

		if( !empty( $content ) ) {
			$handle	= fopen( $file, 'wb' );
			fwrite( $handle, '@tempTest'."\n".$content );
			fclose( $handle );
			
			$cmd	= "./bin/behat --no-paths --tags '@tempTest'";
			$output	= procOpenBehat( $cmd );
			
			unlink( $file );

			foreach( $output as $k ) {
				echo $k."<br />";
			}
			
		} else {
			echo 'no Test selected!';
		}
		exit;
		break;

	case 'deleteContent':
		$fileName	= $_REQUEST['name'];
		$isFile		= $_REQUEST['isFile'];
		$id			= $_REQUEST['id'];
		
		if( $isFile === 'true' ) {
			$filePath	= getFilePath( $id );

			if( unlink( $filePath.'/'.$fileName ) ) {
				echo 'deleted';

			} else {
				echo 'File could not be deleted!';
			}

		} else {

			if( rmdir( PATHTOBEHAT.'features/'.$fileName ) ) {
				echo 'deleted';

			} else {
				echo 'Folder could not be deleted!';
			}
		}
		exit;
		break;
}