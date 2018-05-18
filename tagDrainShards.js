// DO NOT RUN IN PRODUCTION

var tagDrainShards = function(remove=false) {
	sh.stopBalancer();

	var shardsToKeepPercentage = 50;
	var keepTagName = "KEEP";
	var cfgDB = db.getSiblingDB("config");
	var noGo = true;
	

	var checkChunks = function(shardArray) {
		// This function will check how many chunks are residing on the to-be-removed shards
		var counter = 0;

		shardArray.forEach(function(shardName) {
			var countChunks = cfgDB.chunks.count({"shard": shardName});
			counter = counter + countChunks;
		});

		return counter;
	};

	var pickRandomShard = function (criteria) {
		var count = cfgDB.shards.count(criteria);
		var random = Math.floor((Math.random() * count) + 1);
		var shard = "";
		i = 1;
		cfgDB.shards.find(criteria, { "_id": 1 }).forEach(function (doc) {
			if (i == random) {
				shard = doc._id;
			};
			i++;
		});

		return shard;
	};

	var removeShards = function () {
		var cfgDB = db.getSiblingDB("config");
		cfgDB.shards.find({ "tags": { "$exists": false } }, { "_id": 1 }).forEach(function (shard) {
			var res = db.adminCommand({ "removeShard": shard._id });

			if (res.ok != 1) {
				printjson(res);
			} else {
				printjson(res);
				assert(res.hasOwnProperty("dbsToMove"), "The dbsToMove field is not present");
				if (res.dbsToMove.length == 0) {
					var res = db.adminCommand({ "removeShard": shard._id });
					if (res.ok != 1) {
						printjson(res);
					};
				} else {
					res.dbsToMove.forEach(function (database) {
						var sh = pickRandomShard({ "tags": { "$exists": true } });
						var res = db.adminCommand({ "movePrimary": database, "to": sh });
						printjson(res);
					});

					var res = db.adminCommand({ "removeShard": shard._id });
					if (res.ok != 1) {
						printjson(res);
					};
				};
			};
		});
	};

	var tagAndRange = function () {
		var tagsNum = cfgDB.tags.count();
		var shardArray = [];

		if (tagsNum == 0) {
			noGo = false;
		};

		if (!noGo) {
			var shardCount = cfgDB.shards.count();
			var shardsToKeep = parseInt(shardCount * shardsToKeepPercentage / 100);

			var i = 0;

			cfgDB.shards.find({}, { "_id": 1 }).forEach(function (shardDoc) {
				if (i < shardsToKeep) {
					shardArray.push(shardDoc._id);
					var res = sh.addShardTag(shardDoc._id, keepTagName);
					if (res.ok != 1) {
						print(res.errmsg);
					};
				} else {
					// This is to prevent chunk migration to the to-be-removed shards
					var res = cfgDB.shards.updateOne({ "_id": shardDoc._id }, { "$set": { "maxSize": 1 } });
					printjson(res);
				};
				i++;
			});

			cfgDB.collections.find({}, { _id: 1, key: 1 }).forEach(function (colDoc) {
				var fieldsArray = [];

				for (var field in colDoc.key) {
					fieldsArray.push(field);
				};

				var min = {};
				var max = {};
				fieldsArray.forEach(function (field) {
					min[field] = MinKey();
					max[field] = MaxKey();
				});
				var res = sh.addTagRange(colDoc._id, min, max, "KEEP");

				if (res.ok != 1) {
					print(res.errmsg);
				};
			});
		};

		return shardArray;
	};

	var shardsToRemove = tagAndRange();

	var res = sh.startBalancer();
	printjson(res);

	while(checkChunks(shardsToRemove) > 0) {
		sleep(5000);

		while (sh.isBalancerRunning()) {
			print(ISODate() + ": The Balancer is still running");
			sleep(15000);
		};
	};

	if(remove == true) {
		removeShards();
	};

};
