<?php
#error_reporting(E_ALL);

###################################################
# INCLUDES
###################################################
include_once '../local_config.php';

###################################################
# FUNCTIONS
###################################################

/**
 * Gets the filepath
 *
 * @param    string $open    Contains the selected path
 * @return                   The filepath
 */
function getFilePath($open) {
	$dirTree	= new RecursiveDirectoryIterator(PATHTOBEHAT."features", RecursiveDirectoryIterator::SKIP_DOTS);
	$dir		= array();

	foreach ($dirTree as $path) {
		foreach (new DirectoryIterator($path) as $file) {
			if (! $file->isDot()
				&& $file->__toString() !== 'bootstrap'
				&& $file->__toString() !== 'db'
				&& strpos($file->__toString(), '.feature') !== false
			) {
				$dir[] = array(
					'text' => $file->getFilename(),
					'path' => $file->getPath(),
					'id'   => sha1($file->getPathname())
				);
			}
		}
	}
	foreach ($dir as $k => $v) {
		if ($v['id'] == $open) {
			$filePath	= $v['path'];
		}
	}
	return $filePath;
}

/**
 * Executes Behat on the command line
 *
 * @param   string  $cmd    The command to be execute
 * @return  array           The complete shell output
 */
function procOpenBehat($cmd) {
	$descriptorspec	= array(
		0 => array("pipe", "r"),
		1 => array("pipe", "w")
	);
	$process = proc_open($cmd, $descriptorspec, $pipes, PATHTOBEHAT);

	if (is_resource($process)) {
		fwrite($pipes[0], $cmd);
		fclose($pipes[0]);
	}
	$shOutput = explode('$/', stream_get_contents($pipes[1]));
	fclose($pipes[1]);

	return $shOutput;
}

###################################################
# Main Switch (Controller)
###################################################

/**
 * The main switch of the file
 */
switch ($_REQUEST['route']) {
	case 'getSyntaxList':
		$shOutput	= null;
		$output		= null;
		$cmd		= './bin/behat -dl';
		$shOutput	= procOpenBehat($cmd);

		// filters for replacing regexp for better understanding
		$replaceFilter	= array(
			'(\d+)'			=> '%number',
			'(.*)'			=> '%type',
			'(\w+)'			=> '%type',
			'</comment>'	=> '',
			'd{4}'			=> '%number',
			'd{2}'			=> '%number'
		);

		//cleaning the shell output
		foreach ($shOutput as $k => $v) {
			$tmp[]	= trim(preg_replace('/[.\[\]$\*\\\\+\/\^]/', '', str_replace('^"', '', str_replace(array_keys($replaceFilter), $replaceFilter, $v))));
		}

		foreach ($tmp as $k => $sentence) {
			// explode on given, when, then catchwords for grouping!
			$group	= explode(' ', trim($sentence));

			if ($sentence != '') {
				$syntaxList['items'][]	= array(
					'code'	=> preg_replace('/"([^"]*)"/', '"%value"', $sentence),
					'group'	=> $group[0]
				);
			}
		}
		echo json_encode($syntaxList);
		exit;
		break;
	case 'getDirList':
		$dirTree	= new RecursiveDirectoryIterator(PATHTOBEHAT."features", RecursiveDirectoryIterator::SKIP_DOTS);
		$dir		= array();

		foreach ($dirTree as $path) {
			//gets the files in the current directory
			foreach (new DirectoryIterator($path) as $file) {
				if (! $file->isDot() && strpos($file->__toString(), '.feature') !== false) {
					$fileList[] = array(
						'id'   => sha1($file->getPathname()),
						'text' => $file->getFilename(),
						'leaf' => true
					);
				}
			}
			//creates the folder entry and appends the files containing it
			if ($path->getFilename() !== 'bootstrap' && $path->getFilename() !== 'db' && $path->getFilename() !== 'tmp'
			) {
				$dir[]	= array(
					'id'		=> sha1($path->getPathname()),
					'text'		=> $path->getFilename(),
					'leaf'		=> false,
					'children'	=> $fileList
				);
				$fileList = array();
			}
		}
		echo json_encode($dir);
		exit;
		break;
	case 'openFile':
		$id			= $_REQUEST['file'];
		$name		= $_REQUEST['name'];
		$filePath	= getFilePath($id);
		// output file directly
		readfile($filePath.'/'.$name);
		exit;
		break;
	case 'saveFile':
		$content	= $_REQUEST['content'];
		$open		= $_REQUEST['fileName'];
		$id			= $_REQUEST['id'];
		//creates an array for finding the path to the file to be saved
		$filePath	= getFilePath($id);

		if ($handle	= fopen($filePath.'/'.$open, 'w')) {
			fwrite($handle, $content);
			fclose($handle);
			echo 'File saved successfully!';
		} else {
			echo 'File could not be saved!';
		}
		exit;
		break;
	case 'createFolder':
		//filter some suspicious charsets for (a little) security
		$folderName	= trim(htmlspecialchars(strtolower($_REQUEST['folderName'])));
		$folderName	= str_replace(array('..', '/'), '', $folderName);

		//try creating the folder with 0766
		if (! file_exists(PATHTOBEHAT.'features/'.$folderName)) {
			if (mkdir(PATHTOBEHAT.'features/'.$folderName, 0766)) {
				echo 'Folder '.$folderName.' created.';
			} else {
				echo 'Folder could not be created.';
			}
		} else {
			echo 'Folder "'.$folderName.'" already exists!';
		}
		exit;
		break;
	case 'createFile':
		$folderName	= $_REQUEST['folder'];
		//filter some suspicious chars for (little) security
		$fileName	= trim(htmlspecialchars(strtolower($_REQUEST['fileName'])));
		$fileName	= str_replace(array('..', '/'), '', $fileName);
		//try creating the file with full rights for reading, writing and opening
		if (! file_exists(PATHTOBEHAT.'features/'.$folderName.'/'.$fileName.'.feature')) {
			$handler = fopen(
				PATHTOBEHAT.'features/'.$folderName.'/'.$fileName.'.feature',
				'w'
			) or die('File could not be created.');
			fwrite(
				$handler,
				"Feature: featuretext\n\tFeature description\n\nScenario: short scenario-description\n\tGiven \n\tWhen \n\tThen "
			);
			echo 'file '.$fileName.' created.';
			fclose($handler);
		} else {
			echo 'File "'.$fileName.'" in folder "'.$folderName.'" already exists!';
		}
		exit;
		break;
	case 'runTest':
		// runs the selected test-> writes it in a new file with a @tempTest tag!
		$file			= PATHTOBEHAT.'features/tmp/tempTest.feature';
		$selectedText	= isset($_REQUEST['selected']) ? $_REQUEST['selected'] : null;
		// little security
		if ($_REQUEST['outputFormat'] == 'pretty' || $_REQUEST['outputFormat'] == 'progress') {
			$outputFormat	= $_REQUEST['outputFormat'];
		} else {
			$outputFormat	= 'pretty';
			exit;
		}
		if ($_REQUEST['useColors'] == 'true' || $_REQUEST['useColors'] == 'false') {
			$useColors	= $_REQUEST['useColors'];
		} else {
			$useColors	= true;
				exit;
		}
		if ($_REQUEST['hidePaths'] == 'true' || $_REQUEST['hidePaths'] == 'false') {
			$hidePaths	= $_REQUEST['hidePaths'];
		} else {
			$hidePaths	= true;
			exit;
		}
		$content		= $_REQUEST['content'];
		$newContext		= null;
		// added colors for finding failed scenarios easier
		$colorLibrary	= array(
			'[31m'		=> '<span style="color:red">',
			'[32m'		=> '<span style="color:green">',
			'[33m'		=> '<span style="color:gray">',
			'[30m#'		=> '<span style="color:gray">',
			'[32;1m'	=> '',
			'[31;1m'	=> '',
			'[36;1m'	=> '',
			'[36m'		=> '',
			'[0m'		=> '</span>'
		);

		if (! empty($content)) {
			// open the handle
			$handle	= fopen($file, 'wb');
			// check if a text was selected, to differ from running the complete test and only a part of it
			if (! isset($selectedText)) {
				fwrite($handle, '@tempTest'."\n".$content);
			} else {
				$newContext	= explode('Scenario:', $content);
				$newContext	= $newContext[0];
				$newContext	.= "\n".$selectedText;
				fwrite($handle, '@tempTest'."\n".$newContext);
			}
			fclose($handle);

			$colorsFlag	= $useColors == 'true' ? '--ansi' : '';
			$pathsFlag	= $hidePaths == 'true' ? '--no-paths' : '';
			// run selected behat test in command line
			$cmd	= "./bin/behat ".$pathsFlag." ".$colorsFlag." --format ".$outputFormat." --tags '@tempTest'";
			echo str_replace(array_keys($colorLibrary), $colorLibrary, implode(procOpenBehat($cmd)));
			unlink($file);
		} else {
			echo 'no Test selected!';
		}

		exit;
		break;
	case 'deleteContent':
		$fileName	= $_REQUEST['name'];
		$isFile		= $_REQUEST['isFile'] == 'true' ? true : false;
		$id			= $_REQUEST['id'];

		if ($isFile) {
			$filePath	= getFilePath($id);
			if (unlink($filePath.'/'.$fileName)) {
				echo 'deleted';
			} else {
				echo 'File could not be deleted!';
			}
		} else {
			if (rmdir(PATHTOBEHAT.'features/'.$fileName)) {
				echo 'deleted';
			} else {
				echo 'Folder could not be deleted! Maybe not empty?';
			}
		}
		exit;
		break;
}
?>