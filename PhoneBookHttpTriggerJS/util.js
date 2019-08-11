/*
"entities": [
    {
      "entity": "ケータイ",
      "type": "phonetype",
      "startIndex": 3,
      "endIndex": 6,
      "resolution": {
        "values": [
          "携帯電話"
        ]
      }
    },
    {
      "entity": "小澤",
      "type": "who",
      "startIndex": 0,
      "endIndex": 1,
      "score": 0.810699344
    }
  ]
*/


exports.json_find = function(obj, key)
{
    var ret = "";

    var filtered = obj.filter(function(item, index){
        if (item.type == key) return true;
    });

    if (filtered.length > 0) {
        if (key == "phonetype") {
            ret = filtered[0].resolution.values[0];
        } else {
            ret = filtered[0].entity;
        }
    }

    return ret;
};

