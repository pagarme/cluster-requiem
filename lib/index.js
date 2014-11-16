var util = require('util');
var async = require('async');
var events = require('events');
var cluster = require('cluster');

var Tracker = function() {
	events.EventEmitter.call(this);
};

util.inherits(Tracker, events.EventEmitter);

Tracker.prototype.done = function() {
	this.emit('done');
};

var Requiem = function() {
	events.EventEmitter.call(this);

	this.state = 'ready';
	this.options = {};
	this.sockets = [];
	this.trackers = [];

};

util.inherits(Requiem, events.EventEmitter);

Requiem.prototype.initialize = function(options) {
	if (!options) {
		options = {
			handleShutdown: true,
			patchCluster: true
		};
	}

	this.options = options;

	if (options.patchCluster && cluster.isWorker) {
		this._patchCluster();
	}

	if (options.handleShutdown) {
		this._handleShutdown();
	}
};

Requiem.prototype.trackSocket = function(socket) {
	var self = this;

	this.sockets.push(socket);

	socket.once('close', function() {
		self.sockets.splice(self.sockets.indexOf(socket), 1);
	});
};

Requiem.prototype.createTracker = function() {
	var self = this;
	var tracker = new Tracker();

	this.trackers.push(tracker);

	tracker.once('done', function() {
		self.trackers.splice(self.trackers.indexOf(tracker), 1);
	});

	return tracker;
};

Requiem.prototype.track = function(callback) {
	var tracker = this.createTracker();

	callback(function() {
		tracker.done();
	});

	return tracker;
};

Requiem.prototype.begin = function(cb) {
	var self = this;

	if (this.state == 'dead') {
		return cb();
	}

	if (cb) {
		this.on('dead', cb);
	}

	if (this.state != 'ready') {
		return;
	}

	this.state = 'preparing';

	self.emit('begin');

	// Grab the violin, the requiem is starting!
	async.series([
		function(cb) {
			self._closeAllSockets(cb);
		},
		function(cb) {
			self._waitAllTrackers(cb);
		}
	], function() {
		self.state = 'dead';
		self.emit('dead');
	});
};

Requiem.prototype._patchCluster = function() {
	var self = this;
	var disconnect = cluster.worker.disconnect;

	cluster.worker.disconnect = function() {
		self.begin(function() {
			disconnect.apply(this, arguments);
		});
	};
};

Requiem.prototype._handleShutdown = function() {
	process.on('shutdown', function() {
		Requiem.begin(function() {
			if (cluster.isWorker) {
				// Try to do a clean exit
				cluster.worker.disconnect();
			} else {
				process.exit(0);
			}
		});
	});
};

Requiem.prototype._closeAllSockets = function(cb) {
	async.each(this.sockets, function(socket, cb) {
		socket.close(function() {
			cb();
		});
	}, cb);
};

Requiem.prototype._waitAllTrackers = function(cb) {
	async.each(this.trackers, function(tracker, cb) {
		tracker.once('done', function() {
			cb();
		});
	}, cb);
};

module.exports = new Requiem();
