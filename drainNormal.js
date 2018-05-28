
sh.stopBalancer();

var cfgDB = db.getSiblingDB("config");

var checkChunks = function(shardArray) {
    // This function will check how many chunks are residing on the to-be-removed shards
    var counter = 0;

    shardArray.forEach(function(shardName) {
        var countChunks = cfgDB.chunks.count({"shard": shardName});
        counter = counter + countChunks;
    });

    return counter;
};
    
var waitUntilDrained = function(shardsToRemove) {
    while(checkChunks(shardsToRemove) > 0) {
		sleep(1000);

		while (sh.isBalancerRunning()) {
			print(ISODate() + ": The Balancer is still running");
			sleep(1000);
		};
	};

};
ISODate();
sh.startBalancer();
var shardArray = [ "shx2_3", "shx2_4", "shx2_5" ];

shardArray.forEach( function(shard){
    
    var res = cfgDB.shards.updateOne({ "_id": shard }, { "$set": { "maxSize": 1 } });

					printjson(res);
    var res = db.adminCommand({ "removeShard": shard });
			if (res.ok != 1) {
				printjson(res);
			} else {
                printjson(res);
				assert(res.hasOwnProperty("dbsToMove"), "The dbsToMove field is not present");
				if (res.dbsToMove.length == 0) {
                    waitUntilDrained([shard]);
					var res = db.adminCommand({ "removeShard": shard });
					if (res.ok != 1) {
						printjson(res);
					};
				} else {
					res.dbsToMove.forEach(function (database) {
						var sh = "shx2_0";
						var res = db.adminCommand({ "movePrimary": database, "to": sh });
						printjson(res);
                    });

                    waitUntilDrained([shard]);
                    var res = db.adminCommand({ "removeShard": shard });
					if (res.ok != 1) {
						printjson(res);
					};
                };
            };
} );
ISODate();



db.adminCommand( { removeShard : "shx2_3" } );
db.adminCommand( { removeShard : "shx2_4" } );
db.adminCommand( { removeShard : "shx2_5" } );
