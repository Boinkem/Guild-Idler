use napi_derive::napi;

/// Guild-wide leaderboard support for Guildbound -- not upstream in
/// steamworks.js (confirmed by inspecting its actual client.d.ts before
/// starting this), even though the underlying steamworks-rs crate this
/// whole project is built on already has full support
/// (UserStats::find_or_create_leaderboard/upload_leaderboard_score/
/// download_leaderboard_entries). This module lives in the SAME native
/// module as every other API here rather than as a separate addon --
/// deliberate, not incidental: two independently-compiled native modules
/// each calling their own SteamAPI_Init() in the same process is a real,
/// documented failure mode ("Tried to Initialize the SteamAPI twice in
/// one session!"), not a theoretical one. Sharing crate::client's single
/// global STEAM_CLIENT (see client.rs) means there's only ever one
/// init() call in the whole process, exactly like every other module in
/// src/api/ already relies on.
///
/// Scoped to this game's actual need rather than a generic multi-
/// leaderboard API: Guildbound has exactly one leaderboard (Guild
/// Power), with Global/Friends as a DOWNLOAD-time scope on that single
/// board (LeaderboardDataRequest), not two separately-created boards --
/// corrects an earlier assumption made before actually reading the real
/// API. The Steam `Leaderboard` handle itself never crosses the JS
/// boundary at all: its inner u64 field isn't `pub` in steamworks-rs (no
/// public from-raw constructor exists), so rather than fighting that,
/// it's cached Rust-side in GUILD_POWER_LEADERBOARD and looked up (or
/// created once) on first use -- JS never sees or passes a handle.
#[napi]
pub mod leaderboard {
    use napi::bindgen_prelude::Error;
    use std::sync::Mutex;
    use steamworks::{
        Leaderboard, LeaderboardDataRequest, LeaderboardDisplayType, LeaderboardSortMethod,
        UploadScoreMethod,
    };
    use tokio::sync::oneshot;

    lazy_static! {
        static ref GUILD_POWER_LEADERBOARD: Mutex<Option<Leaderboard>> = Mutex::new(None);
    }

    /// Fixed, not configurable from JS -- this game has exactly one
    /// leaderboard. Sort descending (higher Guild Power ranks first),
    /// Numeric display -- both fixed at creation time only; re-calling
    /// find_or_create_leaderboard for an EXISTING board ignores these two
    /// params entirely (steamworks-rs's own doc comment on the function),
    /// so this only actually matters the very first time the board is
    /// created for real, either by this call or by the Steamworks App
    /// Admin panel directly.
    const LEADERBOARD_NAME: &str = "GUILD_POWER";

    async fn get_or_create_leaderboard() -> Result<Leaderboard, Error> {
        if let Some(lb) = GUILD_POWER_LEADERBOARD.lock().unwrap().clone() {
            return Ok(lb);
        }

        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client.user_stats().find_or_create_leaderboard(
            LEADERBOARD_NAME,
            LeaderboardSortMethod::Descending,
            LeaderboardDisplayType::Numeric,
            move |result| {
                let _ = tx.send(result);
            },
        );

        match rx.await.map_err(|e| Error::from_reason(e.to_string()))? {
            Ok(Some(lb)) => {
                *GUILD_POWER_LEADERBOARD.lock().unwrap() = Some(lb.clone());
                Ok(lb)
            }
            Ok(None) => Err(Error::from_reason(
                "GUILD_POWER leaderboard not found and could not be created",
            )),
            Err(e) => Err(Error::from_reason(e.to_string())),
        }
    }

    /// `force_update` false (the common case) keeps the player's best
    /// score if the new one is worse -- matches the sanity-clamp/keep-
    /// the-best decision already recorded in guild-idler-status.md for
    /// why a temporary Guild Power dip (a prestige reset, say) shouldn't
    /// tank a rank that was legitimately earned. Returns false (not an
    /// error) if Steam declined the upload without giving a reason --
    /// distinguished from a genuine error, which still surfaces as a
    /// rejected promise.
    #[napi]
    pub async fn upload_guild_power_score(score: i32, force_update: bool) -> Result<bool, Error> {
        let lb = get_or_create_leaderboard().await?;
        let client = crate::client::get_client();
        let method = if force_update {
            UploadScoreMethod::ForceUpdate
        } else {
            UploadScoreMethod::KeepBest
        };
        let (tx, rx) = oneshot::channel();
        client
            .user_stats()
            .upload_leaderboard_score(&lb, method, score, &[], move |result| {
                let _ = tx.send(result);
            });

        match rx.await.map_err(|e| Error::from_reason(e.to_string()))? {
            Ok(Some(_)) => Ok(true),
            Ok(None) => Ok(false),
            Err(e) => Err(Error::from_reason(e.to_string())),
        }
    }

    #[napi]
    pub enum GuildPowerScope {
        Global,
        Friends,
    }

    #[napi(object)]
    pub struct GuildPowerEntry {
        /// String, not a number or BigInt -- a 64-bit Steam ID loses
        /// precision as a plain JS number, and a plain string is simpler
        /// on the TS side than threading BigInt through JSON-shaped IPC
        /// for a value that's only ever displayed or compared, never
        /// arithmetic'd on.
        pub steam_id64: String,
        /// Resolved here, not left for the JS side to look up separately
        /// per entry -- `Friends::get_friend(id).name()` correctly
        /// returns a real persona name even for a stranger (not a Steam
        /// friend), because Steam specifically caches that info for every
        /// user returned by a leaderboard download for exactly this
        /// reason. Falls back to the raw SteamID64 as a string if Steam
        /// genuinely has nothing cached (name comes back empty) --
        /// happens occasionally for a very stale/inactive account,
        /// better than showing a blank row.
        pub name: String,
        pub global_rank: i32,
        pub score: i32,
    }

    #[napi]
    pub async fn download_guild_power_entries(
        scope: GuildPowerScope,
        start: i32,
        end: i32,
    ) -> Result<Vec<GuildPowerEntry>, Error> {
        let lb = get_or_create_leaderboard().await?;
        let client = crate::client::get_client();
        let request = match scope {
            GuildPowerScope::Global => LeaderboardDataRequest::Global,
            GuildPowerScope::Friends => LeaderboardDataRequest::Friends,
        };
        let (tx, rx) = oneshot::channel();
        client.user_stats().download_leaderboard_entries(
            &lb,
            request,
            start as usize,
            end as usize,
            0,
            move |result| {
                let _ = tx.send(result);
            },
        );

        match rx.await.map_err(|e| Error::from_reason(e.to_string()))? {
            Ok(entries) => Ok(entries
                .into_iter()
                .map(|e| {
                    let name = client.friends().get_friend(e.user).name();
                    GuildPowerEntry {
                        steam_id64: e.user.raw().to_string(),
                        name: if name.is_empty() { e.user.raw().to_string() } else { name },
                        global_rank: e.global_rank,
                        score: e.score,
                    }
                })
                .collect()),
            Err(e) => Err(Error::from_reason(e.to_string())),
        }
    }
}
