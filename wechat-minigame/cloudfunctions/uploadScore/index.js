const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const score = event.score;

    if (typeof score !== 'number') return { error: 'Invalid score' };

    let nickname = typeof event.nickname === 'string' ? event.nickname.trim() : '';
    if (!nickname) {
        nickname = 'Unknown Player';
    } else {
        try {
            const secRes = await cloud.openapi.security.msgSecCheck({
                openid,
                scene: 1,
                version: 2,
                content: nickname,
                nickname,
            });
            if (secRes.errCode != null && secRes.errCode !== 0) {
                return { error: 'content_sec_check_failed', errMsg: secRes.errMsg || '' };
            }
            if (secRes.result && secRes.result.suggest === 'risky') {
                return { error: 'content_not_allowed' };
            }
        } catch (e) {
            return { error: 'content_sec_check_failed', errMsg: e.errMsg || String(e.message || e) };
        }
    }

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
