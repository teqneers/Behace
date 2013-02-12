Behace
===

Behace is a web editor designed for supporting you in writing features for your Behat tests. 
It is based on the Ace Editor and wrapped in the ExtJS Framework.

What Behace is capable off...
-------

-  Behace contains a behat syntax highlighting for typical catchwords(like 'Scenario', 'Given', 'When', 'Then' ,etc.) and quoted variable values
-	Write 'feature' files supported by the code completion for implemented sentences 
-	Organise and search in your 'feature' folder- and file-structure within Behace
-	Run your behat tests directly in the browser and check the results
-	Open your feature-files simultaneously in a tab-structure
-	Review and filter all available sentences in a collapsible list

...and what it is not
-------

**PLEASE NOTE**

-	Behace is in an early stadium of development and
-	contains very little security features!

Requirements
-------

-	PHP >= 5.3.0
-	Behat >= 2.4.0
-	read/write rights for the behat feature folder

Included
-------

-	[Ace Editor](http://ace.ajax.org/)
-	[ExtJS 4.0.7](http://www.sencha.com/products/extjs/)

Set up Behace
-------

-	clone this repository
-	copy/rename the 'local_config_template.php' to 'local_config.php'
-	adjust the 'PATHTOBEHAT' constant in the 'local_config.php' file to the path to your Behat base directory
-	open Behace in your browser

How Behace works
-------

-	create and/or open an existing 'feature' file
-	Start writing your 'Scenarios'
-	The code completion feature should trigger if it finds suitable sentences
-	Choose the sentence with the UP or DOWN arrow keys and hit enter for inserting the selected sentence
-	If the sentence contains variables, they should be automatically selected for replacing
-	Jump directly to the next (available) variable with the TAB button

Contribute
----------

Please feel free to use the Git issue tracking to report back any problems or errors. You're encouraged to clone the repository and send pull requests if you'd like to contribute actively in developing Behace.

License
-------

Copyright (C) 2013 by TEQneers GmbH & Co. KG

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
