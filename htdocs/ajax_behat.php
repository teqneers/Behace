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
		$syntaxList	= null;
		$shOutput	= null;
		$output		= null;
		$cmd		= './bin/behat -dl';
		$shOutput	= procOpenBehat($cmd);

		// filters for replacing regexp for better understanding
		$replaceFilter	= array(
			'(\d+)'			=> '%number',
			'[\d]{4}'		=> '%year',
			'[\d]{2}'		=> '%month',
			'(.*)'			=> '%type',
			'(\w+)'			=> '%type',
			'</comment>'	=> '',
			'd{4}'			=> '%year',
			'd{2}'			=> '%month',
			'd]{1,2}'		=> '%month',
			'd{1,2}'		=> '%month',
			'([\d.,]+)'		=> '%number'
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
		$fileList = array();
		try {
			$dirTree	= new RecursiveDirectoryIterator(PATHTOBEHAT."features", RecursiveDirectoryIterator::SKIP_DOTS);
		} catch (UnexpectedValueException $e) {
			echo 'Error: '.$e->getMessage();
		}

		$dir	= array();
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
		if (is_readable($filePath.'/'.$name)) {
			readfile($filePath.'/'.$name);
		} else {
			echo 'File could not be loaded. Please make sure path is readable.';
		}
		exit;
		break;
	case 'saveFile':
		$content	= $_REQUEST['content'];
		$open		= $_REQUEST['fileName'];
		$id			= $_REQUEST['id'];
		//creates an array for finding the path to the file to be saved
		$filePath	= getFilePath($id);

		if (is_writable($filePath.'/'.$open)) {
			$handle	= fopen($filePath.'/'.$open, 'w');
			fwrite($handle, $content);
			fclose($handle);
			echo 'File saved successfully!';
		} else {
			echo 'File could not be saved. Please make sure path is writable.';
		}

		exit;
		break;
	case 'createFolder':
		//filter some suspicious charsets for (a little) security
		$folderName	= trim(htmlspecialchars(strtolower($_REQUEST['folderName'])));
		$folderName	= str_replace(array('..', '/'), '', $folderName);

		//try creating the folder with 0777
		if (! file_exists(PATHTOBEHAT.'features/'.$folderName)) {
			try {
				mkdir(PATHTOBEHAT.'features/'.$folderName, 0777);
				echo 'Folder '.$folderName.' created.';
			} catch(ErrorException $e) {
				echo 'Error: '.$e->getMessage();
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
			try {
				$handler = fopen(
					PATHTOBEHAT.'features/'.$folderName.'/'.$fileName.'.feature',
					'w'
				);
				if (! $handler) {
					throw new Exception('Error: File could not be created. Please make sure path is writable.');
				}
			} catch(Exception $e) {
				echo 'Error: '.$e->getMessage();
				exit;
			}
			fwrite(
				$handler,
				"Feature: featuretext\n\tFeature description\n\nScenario: short scenario-description\n\tGiven \n\tWhen \n\tThen "
			);
			// return the sha1 of the filepath for expanding the tree to the created File
			echo sha1(PATHTOBEHAT.'features/'.$folderName.'/'.$fileName.'.feature');
			fclose($handler);
		} else {
			echo 'Error: File could not be created. File already exists.';
		}
		exit;
		break;
	case 'runTest':
		$selectionOnly	= isset($_REQUEST['selectionOnly']) ? true : false;
		$selectedText	= isset($_REQUEST['selected']) ? str_replace(array('..', '/'), '', $_REQUEST['selected']) : null;
		if ($selectionOnly && $selectedText == null) {
			echo 'No scenario selected.';
			exit;
		}

		// little security
		if ($_REQUEST['outputFormat'] == 'pretty' || $_REQUEST['outputFormat'] == 'progress') {
			$outputFormat	= $_REQUEST['outputFormat'];
		} else {
			echo 'no';
			exit;
		}
		$testName	= trim(explode(":", explode("\n", $_REQUEST['content'])[0])[1]);
		$newContext	= null;

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

		if (! empty($testName)) {
			if (isset($selectedText)) {
				// gets text after the 'Scenario:' tag
				$testName	= trim(explode(":", explode("\n", $selectedText)[0])[1]);
			}
			$colorsFlag	= $_REQUEST['useColors'] == 'true' ? '--ansi' : '';
			$pathsFlag	= $_REQUEST['hidePaths'] == 'true' ? '--no-paths' : '';
			// run selected behat test in command line
			$cmd	= "./bin/behat ".$pathsFlag." ".$colorsFlag." --format ".$outputFormat." --name '".$testName."'";
			echo str_replace(array_keys($colorLibrary), $colorLibrary, implode(procOpenBehat($cmd)));
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
			if (is_writable($filePath.'/'.$fileName)) {
				unlink($filePath.'/'.$fileName);
				echo 'deleted';
			} else {
				echo 'File could not be deleted. Please make sure path is writable.';
			}
		} else {
			if (is_writable(PATHTOBEHAT.'features/'.$fileName) && count(scandir(PATHTOBEHAT.'features/'.$fileName)) == 2) {
				rmdir(PATHTOBEHAT.'features/'.$fileName);
				echo 'deleted';
			} else {
				echo 'Folder could not be deleted! Maybe not empty?';
			}
		}
		exit;
		break;
}
?>