const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const score = event.score;

    const nickname = event.nickname || 'Unknown Player';

    if (typeof score !== 'number') return { error: 'Invalid score' };

    // Get Beijing Time Date String
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const dateStr = beijingTime.toISOString().split('T')[0];

    try {
        const existing = await db.collection('scores').where({
            openid: openid,
            dateStr: dateStr
        }).get();

        if (existing.data.length > 0) {
            // Update only if strictly greater
            if (score > existing.data[0].score) {
                await db.collection('scores').doc(existing.data[0]._id).update({
                    data: {
                        score: score,
                        nickname: nickname,
                        timestamp: db.serverDate()
                    }
                });
            }
        } else {
            await db.collection('scores').add({
                data: {
                    openid: openid,
                    score: score,
                    nickname: nickname,
                    dateStr: dateStr,
                    timestamp: db.serverDate()
                }
            });
        }
        return { success: true };
    } catch (e) {
        return { error: e };
    }
};
