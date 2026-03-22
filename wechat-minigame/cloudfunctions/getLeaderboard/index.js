const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    // Beijing Time Midnight Threshold
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const dateStr = beijingTime.toISOString().split('T')[0];

    try {
        const top10Res = await db.collection('scores')
            .where({ dateStr: dateStr })
            .orderBy('score', 'desc')
            .limit(10)
            .get();

        let myRank = '-';
        let myScore = 0;
        let myNickname = 'Unknown Player';

        const myRecordRes = await db.collection('scores')
            .where({ openid: openid, dateStr: dateStr })
            .get();

        if (myRecordRes.data.length > 0) {
            myScore = myRecordRes.data[0].score;
            myNickname = myRecordRes.data[0].nickname;
            
            const countRes = await db.collection('scores').where({
                dateStr: dateStr,
                score: _.gt(myScore)
            }).count();
            
            myRank = countRes.total + 1;
        }

        return { 
            success: true, 
            data: top10Res.data, 
            myData: { rank: myRank, score: myScore, nickname: myNickname }
        };
    } catch (e) {
        return { error: e };
    }
};
