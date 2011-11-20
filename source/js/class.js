//chrome-extension://hniolkcjkcfecgnhgpmeddfhndceheci/popup.html

function Torrent() {

	const	TORRENT_WAIT_VERIFY	= 1
	,		TORRENT_VERIFING	= 2
	,		TORRENT_DOWNLOADING	= 4
	,		TORRENT_SEEDING		= 8
	,		TORRENT_PAUSED		= 16
	;

	this.id = 0;
	this.name = '';
	this.status = 0;
	this.elem = document.createElement('li');

	// send RPC for a torrent
	this.sendRPC = function(method, ctrlDown) {
		clearTimeout(refresh);

		var deleteCmd = (method === 'torrent-remove' && ctrlDown) ? ', "delete-local-data": true' : '';

		port.postMessage({ args: '"ids": [ ' + this.id + ' ]' + deleteCmd, method: method });

		refresh = setTimeout(refreshPopup, method === 'torrent-stop' ? 500 : 0);
	};

	// test the torrent name against the current filter and set whether it's visible or not
	this.filter = function() {
		var filter = !localStorage.torrentFilter
						? ''
						: new RegExp(localStorage.torrentFilter.replace(/ /g, '[^A-z0-9]*'), 'i')
		,	type = localStorage.torrentType || 0
		;

		if ((type == 0 || this.status == type) && this.name.search(filter) > -1) {
			$('#list').append(this.elem);
		} else {
			$('#list_hidden').append(this.elem);
		}
	};

	// create the list element and update torrent properties
	this.createElem = function(props) {
		if (!!props.id) this.id = props.id;
		if (!!props.name) this.name = props.name;
		if (!!props.status) this.status = props.status;

		var thisTorrent = this,
			percentDone = 100 - (props.leftUntilDone / props.sizeWhenDone * 100),
			nameElem = document.createElement('div'),
			statsElem = document.createElement('div'),
			speedsElem = document.createElement('div'),
			progressElem = document.createElement('div'),
			curProgressElem = document.createElement('div'),
			pauseElem = document.createElement('div'),
			resumeElem = document.createElement('div'),
			removeElem = document.createElement('div');

		this.elem.appendChild(nameElem);
		this.elem.appendChild(statsElem);
		this.elem.appendChild(progressElem);
		this.elem.appendChild(pauseElem);
		this.elem.appendChild(resumeElem);
		this.elem.appendChild(removeElem);

		nameElem.className = 'torrent_name';
		nameElem.setAttribute('title', props.name + '\n\nDownloaded to: ' + props.downloadDir);
		nameElem.innerHTML = props.name;

		statsElem.appendChild(speedsElem);
		statsElem.className = 'torrent_stats';

		speedsElem.className = 'torrent_speeds';

		progressElem.appendChild(curProgressElem);
		progressElem.className = 'torrent_progress';

		if (percentDone === 100) {
			curProgressElem.className = 'complete';
			$(curProgressElem).css('width', percentDone + '%');
		} else if (percentDone > 0) {
			curProgressElem.className = 'downloading';
			$(curProgressElem).css('width', percentDone + '%');
		} else {
			$(curProgressElem).hide();
		}

		pauseElem.className = 'torrent_button pause';
		pauseElem.setAttribute('title', 'Pause');
		pauseElem.addEventListener('click', function() { thisTorrent.sendRPC('torrent-stop'); }, true);

		resumeElem.className = 'torrent_button resume';
		resumeElem.setAttribute('title', 'Resume');
		resumeElem.addEventListener('click', function() { thisTorrent.sendRPC('torrent-start'); }, true);

		removeElem.setAttribute('name', 'torrent_remove');
		removeElem.className = 'torrent_button remove';
		removeElem.setAttribute('title', 'Double-click to remove torrent\n\nHold down CTRL to also delete data');
		removeElem.addEventListener('dblclick', function() { thisTorrent.sendRPC('torrent-remove', event.ctrlKey); }, true);

		$(pauseElem).toggle(props.status === TORRENT_DOWNLOADING || props.status === TORRENT_SEEDING);
		$(resumeElem).toggle(props.status === TORRENT_PAUSED);

		switch(props.status) {
			case TORRENT_WAIT_VERIFY:
				statsElem.appendChild(document.createTextNode(
					formatBytes(props.sizeWhenDone - props.leftUntilDone) + ' of ' + formatBytes(props.sizeWhenDone) +
					' (' + percentDone.toFixed(2) + '%) - waiting to verify local data'
				));
				speedsElem.innerHTML = '';
			break;
			case TORRENT_VERIFING:
				statsElem.appendChild(document.createTextNode(
					formatBytes(props.sizeWhenDone - props.leftUntilDone) + ' of ' + formatBytes(props.sizeWhenDone) +
					' (' + percentDone.toFixed(2) + '%) - verifying local data (' + (props.recheckProgress * 100).toFixed() + '%)'
				));
				speedsElem.innerHTML = '';
			break;
			case TORRENT_DOWNLOADING:
				if (props.metadataPercentComplete < 1) {
					statsElem.appendChild(document.createTextNode('\
						Magnetized transfer - retrieving metadata (' + (props.metadataPercentComplete * 100).toFixed() + '%)'
					));
					speedsElem.innerHTML = '';
					progressElem.className = 'torrent_progress magnetizing';
				} else {
					statsElem.appendChild(document.createTextNode(
						formatBytes(props.sizeWhenDone - props.leftUntilDone) + ' of ' + formatBytes(props.sizeWhenDone) +
						' (' + percentDone.toFixed(2) + '%) - ' + formatSeconds(props.eta) + ' remaining'
					));
					speedsElem.innerHTML = 'DL: ' + formatBytes(props.rateDownload) + '/s UL: ' + formatBytes(props.rateUpload) + '/s';
				}
			break;
			case TORRENT_SEEDING:
				statsElem.appendChild(document.createTextNode(
					formatBytes(props.sizeWhenDone)
					+ ' - Seeding, uploaded ' + formatBytes(props.uploadedEver)
					+ ' (Ratio ' + (props.uploadedEver / props.sizeWhenDone).toFixed(2) + ')'
				));
				speedsElem.innerHTML = 'UL: ' + formatBytes(props.rateUpload) + '/s';
				$(curProgressElem).attr('class', 'seeding');
			break;
			case TORRENT_PAUSED:
				if (props.leftUntilDone) {
					statsElem.appendChild(document.createTextNode(
						formatBytes(props.sizeWhenDone - props.leftUntilDone)
						+ ' of ' + formatBytes(props.sizeWhenDone)
						+ ' (' + percentDone.toFixed(2) + '%) - Paused'
					));
				} else {
					var done = (props.doneDate > 0) ? props.doneDate : props.addedDate;
					statsElem.appendChild(document.createTextNode(
						formatBytes(props.sizeWhenDone)
						+ ' - Completed on ' + new Date(done * 1000).toLocaleDateString()
					));
				}
				speedsElem.innerHTML = '';
				curProgressElem.className = 'paused';
			break;
		}
	};

	// update the list element and update torrent properties
	this.updateElem = function(props) {
		if (typeof props.status !== 'undefined') this.status = props.status;

		var percentDone = 100 - (props.leftUntilDone / props.sizeWhenDone * 100),
			statsElem = this.elem.childNodes[1],
			speedsElem = statsElem.childNodes[0],
			progress = $(this.elem.childNodes[2]),
			progressBar = $(this.elem.childNodes[2].childNodes[0]),
			pauseElem = this.elem.childNodes[3],
			resumeElem = this.elem.childNodes[4];

		//name
		$(this.elem.childNodes[0]).attr('title', props.name + '\n\nDownloaded to: ' + props.downloadDir);

		progress.attr('class', 'torrent_progress');

		if (percentDone === 100) {
			progressBar.attr('class', 'complete');
			progressBar.css('width', percentDone + '%');
		} else if (percentDone > 0) {
			progressBar.attr('class', 'downloading');
			progressBar.css('width', percentDone + '%');
		} else {
			progressBar.hide();
		}

		$(pauseElem).toggle(props.status === TORRENT_DOWNLOADING || props.status === TORRENT_SEEDING);
		$(resumeElem).toggle(props.status === TORRENT_PAUSED);

		switch(props.status) {
			case TORRENT_WAIT_VERIFY:
				statsElem.childNodes[1].textContent = formatBytes(props.sizeWhenDone - props.leftUntilDone)
													+ ' of ' + formatBytes(props.sizeWhenDone)
													+ ' (' + percentDone.toFixed(2)
													+ '%) - waiting to verify local data';
				speedsElem.innerHTML = '';
			break;
			case TORRENT_VERIFING:
				statsElem.childNodes[1].textContent = formatBytes(props.sizeWhenDone - props.leftUntilDone)
												+ ' of ' + formatBytes(props.sizeWhenDone)
												+ ' (' + percentDone.toFixed(2)
												+ '%) - verifying local data ('
												+ (props.recheckProgress * 100).toFixed() + '%)';
				speedsElem.innerHTML = "";
			break;
			case TORRENT_DOWNLOADING:
				if (props.metadataPercentComplete < 1) {
					statsElem.childNodes[1].textContent = 'Magnetized transfer - retrieving metadata ('
														+ (props.metadataPercentComplete * 100).toFixed() + '%)';
					speedsElem.innerHTML = '';
					progress.attr('class', 'torrent_progress magnetizing');
				} else {
					statsElem.childNodes[1].textContent = formatBytes(props.sizeWhenDone - props.leftUntilDone)
											+ ' of ' + formatBytes(props.sizeWhenDone)
											+ ' (' + percentDone.toFixed(2) + '%) - '
											+ formatSeconds(props.eta) + ' remaining';
					speedsElem.innerHTML = 'DL: ' + formatBytes(props.rateDownload) + '/s UL: ' + formatBytes(props.rateUpload) + '/s';
				}
			break;
			case TORRENT_SEEDING:
				statsElem.childNodes[1].textContent = formatBytes(props.sizeWhenDone)
												+ ' - Seeding, uploaded ' + formatBytes(props.uploadedEver)
												+ ' (Ratio ' + (props.uploadedEver / props.sizeWhenDone).toFixed(2) + ')';

				speedsElem.innerHTML = 'UL: ' + formatBytes(props.rateUpload) + '/s';;
				progressBar.attr('class', 'seeding');
			break;
			case TORRENT_PAUSED:
				if (props.leftUntilDone) {
					statsElem.childNodes[1].textContent = formatBytes(props.sizeWhenDone - props.leftUntilDone)
													+ ' of ' + formatBytes(props.sizeWhenDone)
													+ ' ('+ percentDone.toFixed(2) + '%) - Paused';
				} else {
					var done = (props.doneDate > 0) ? props.doneDate : props.addedDate;
					statsElem.childNodes[1].textContent = formatBytes(props.sizeWhenDone)
													+ ' - Completed on ' + new Date(done * 1000).toLocaleDateString();
				}

				progressBar.attr('class', 'paused');
				speedsElem.innerHTML = '';
			break;
		}
	};

	// remove the list element for torrent
	this.removeElem = function() {
		this.elem.parentNode.removeChild(this.elem);
	};
}
