import {interpolate, Series, spring, staticFile, useCurrentFrame, useVideoConfig, Video} from 'remotion';

const TextOverlay = ({text, startFrame = 10}: {text: string; startFrame?: number}) => {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame - startFrame, [0, 20], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const translateY = interpolate(frame - startFrame, [0, 20], [20, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 140,
				left: 48,
				right: 48,
				opacity,
				transform: `translateY(${translateY}px)`,
				fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
				fontSize: 56,
				fontWeight: 800,
				color: '#ffffff',
				lineHeight: 1.15,
				textShadow: '0 2px 24px rgba(0,0,0,0.9)',
				letterSpacing: '-0.5px',
			}}
		>
			{text}
		</div>
	);
};

const VideoScene = ({src, text}: {src: string; text: string}) => {
	return (
		<div style={{width: '100%', height: '100%', background: '#000', position: 'relative', overflow: 'hidden'}}>
			<Video
				src={staticFile(src)}
				style={{width: '100%', height: '100%', objectFit: 'cover'}}
			/>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.75) 100%)',
				}}
			/>
			{text ? <TextOverlay text={text} /> : null}
		</div>
	);
};

const PlaceholderScene = ({label, text}: {label: string; text: string}) => {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				background: '#000',
				position: 'relative',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<div style={{color: '#222', fontSize: 28, fontWeight: 600, fontFamily: '-apple-system, sans-serif', textAlign: 'center'}}>
				{label}
			</div>
			<div
				style={{
					position: 'absolute',
					bottom: 140,
					left: 48,
					right: 48,
					opacity,
					fontFamily: '-apple-system, sans-serif',
					fontSize: 56,
					fontWeight: 800,
					color: '#fff',
					lineHeight: 1.15,
					textShadow: '0 2px 24px rgba(0,0,0,0.9)',
				}}
			>
				{text}
			</div>
		</div>
	);
};

const AnimatedCard = ({children, delay, style}: {children: React.ReactNode; delay: number; style?: React.CSSProperties}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const progress = spring({frame: frame - delay, fps, config: {damping: 18, stiffness: 120, mass: 0.8}});
	const opacity = interpolate(frame - delay, [0, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<div style={{opacity, transform: `translateY(${interpolate(progress, [0, 1], [32, 0])}px)`, ...style}}>
			{children}
		</div>
	);
};

const CountUp = ({target, startFrame}: {target: number; startFrame: number}) => {
	const frame = useCurrentFrame();
	const progress = interpolate(frame - startFrame, [0, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return <>{Math.round(target * progress)}</>;
};

const UpliftAppScene = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const PURPLE = '#7C3AED';
	const PURPLE_DIM = 'rgba(124,58,237,0.15)';
	const BG = '#000000';
	const CARD_BG = '#0f0f0f';
	const BORDER = '#1a1a1a';

	const feedUsers = [
		{initials: 'JM', name: 'Jake M.', action: 'crushed chest day', streak: 14, time: '2m ago'},
		{initials: 'TR', name: 'Tyler R.', action: 'hit a 5-day streak', streak: 5, time: '8m ago'},
		{initials: 'AK', name: 'Alex K.', action: 'joined Flex Friday', streak: 3, time: '12m ago'},
	];

	const sections = [
		{label: 'GROUP FEED', startAt: 0},
		{label: 'CHALLENGES', startAt: 65},
		{label: 'LEADERBOARD', startAt: 130},
	];

	const currentSection = sections.reduce((acc, s) => (frame >= s.startAt ? s : acc), sections[0]);

	const sectionOpacity = (startAt: number, endAt: number) =>
		interpolate(frame, [startAt, startAt + 20, endAt - 10, endAt], [0, 1, 1, 0], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});

	const leaderboardData = [
		{rank: 1, name: 'Tyler R.', workouts: 18, streak: 14},
		{rank: 2, name: 'Jake M.', workouts: 15, streak: 11},
		{rank: 3, name: 'You', workouts: 12, streak: 8},
		{rank: 4, name: 'Alex K.', workouts: 9, streak: 5},
	];

	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				background: BG,
				position: 'relative',
				fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				overflow: 'hidden',
			}}
		>
			{/* Uplift wordmark */}
			<div style={{position: 'absolute', top: 64, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
				<div style={{fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: '-1px'}}>
					<span style={{color: PURPLE}}>UP</span>LIFT
				</div>
			</div>

			{/* Section tabs */}
			<div style={{position: 'absolute', top: 130, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 40}}>
				{sections.map((s) => (
					<div
						key={s.label}
						style={{
							fontSize: 18,
							fontWeight: 700,
							letterSpacing: '0.1em',
							color: currentSection.label === s.label ? PURPLE : '#2a2a2a',
						}}
					>
						{s.label}
					</div>
				))}
			</div>

			{/* SECTION 1: GROUP FEED */}
			<div style={{position: 'absolute', width: 520, opacity: sectionOpacity(0, 65)}}>
				<div style={{background: CARD_BG, borderRadius: 28, border: `1px solid ${BORDER}`, overflow: 'hidden'}}>
					{feedUsers.map((user, i) => {
						const itemOpacity = interpolate(frame, [i * 12, i * 12 + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
						const itemY = interpolate(frame, [i * 12, i * 12 + 20], [20, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
						return (
							<div
								key={i}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 20,
									padding: '24px 28px',
									borderBottom: i < feedUsers.length - 1 ? `1px solid ${BORDER}` : 'none',
									opacity: itemOpacity,
									transform: `translateY(${itemY}px)`,
								}}
							>
								<div
									style={{
										width: 52,
										height: 52,
										borderRadius: '50%',
										background: PURPLE_DIM,
										border: `1px solid ${PURPLE}`,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 18,
										fontWeight: 700,
										color: PURPLE,
										flexShrink: 0,
									}}
								>
									{user.initials}
								</div>
								<div style={{flex: 1}}>
									<div style={{fontSize: 18, fontWeight: 700, color: '#fff'}}>{user.name}</div>
									<div style={{fontSize: 14, color: '#555', marginTop: 3}}>{user.action} · {user.time}</div>
								</div>
								<div
									style={{
										background: PURPLE_DIM,
										border: `1px solid ${PURPLE}`,
										borderRadius: 24,
										padding: '6px 16px',
										fontSize: 14,
										fontWeight: 700,
										color: PURPLE,
									}}
								>
									🔥 {user.streak}
								</div>
							</div>
						);
					})}
				</div>
				<AnimatedCard delay={36} style={{display: 'flex', gap: 16, marginTop: 20}}>
					{[
						{label: 'Active this week', target: 847, suffix: ' users'},
						{label: 'Workouts logged', target: 12400, suffix: '+'},
					].map((stat, i) => (
						<div key={i} style={{flex: 1, background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '20px 24px'}}>
							<div style={{fontSize: 12, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8}}>
								{stat.label}
							</div>
							<div style={{fontSize: 30, fontWeight: 800, color: '#fff'}}>
								<CountUp target={stat.target} startFrame={36} />{stat.suffix}
							</div>
						</div>
					))}
				</AnimatedCard>
			</div>

			{/* SECTION 2: CHALLENGES */}
			<div style={{position: 'absolute', width: 520, opacity: sectionOpacity(65, 130)}}>
				<AnimatedCard delay={65}>
					<div style={{background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 28, padding: '32px'}}>
						<div style={{fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#444', textTransform: 'uppercase', marginBottom: 16}}>
							Active Challenge
						</div>
						<div style={{fontSize: 38, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: 8}}>
							Flex Friday
						</div>
						<div style={{fontSize: 16, color: '#444', marginBottom: 32}}>
							Work out every Friday for 4 weeks. Miss one, lose your stake.
						</div>
						<div style={{display: 'flex', gap: 16, marginBottom: 32}}>
							{[
								{label: 'Pool', target: 240, prefix: '$', suffix: ''},
								{label: 'Players', target: 6, prefix: '', suffix: ''},
								{label: 'Days left', target: 18, prefix: '', suffix: ''},
							].map((item, i) => (
								<div key={i} style={{flex: 1, background: '#080808', borderRadius: 16, padding: '16px 20px', border: `1px solid ${BORDER}`}}>
									<div style={{fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8}}>
										{item.label}
									</div>
									<div style={{fontSize: 28, fontWeight: 800, color: i === 0 ? PURPLE : '#fff'}}>
										{item.prefix}<CountUp target={item.target} startFrame={75} />{item.suffix}
									</div>
								</div>
							))}
						</div>
						<div
							style={{
								background: PURPLE,
								borderRadius: 16,
								padding: '18px 0',
								textAlign: 'center',
								fontSize: 18,
								fontWeight: 800,
								color: '#fff',
							}}
						>
							Stake & Join
						</div>
					</div>
				</AnimatedCard>
			</div>

			{/* SECTION 3: LEADERBOARD */}
			<div style={{position: 'absolute', width: 520, opacity: sectionOpacity(130, 200)}}>
				<div style={{background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 28, overflow: 'hidden'}}>
					<div style={{padding: '28px 32px 20px', borderBottom: `1px solid ${BORDER}`}}>
						<div style={{fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#444', textTransform: 'uppercase', marginBottom: 6}}>
							This Month
						</div>
						<div style={{fontSize: 32, fontWeight: 900, color: '#fff'}}>Leaderboard</div>
					</div>
					{leaderboardData.map((entry, i) => {
						const itemOpacity = interpolate(frame, [130 + i * 10, 130 + i * 10 + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
						const itemY = interpolate(frame, [130 + i * 10, 130 + i * 10 + 20], [16, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
						const isYou = entry.name === 'You';
						const medal = ['🥇', '🥈', '🥉'];
						return (
							<div
								key={i}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 20,
									padding: '20px 32px',
									borderBottom: i < leaderboardData.length - 1 ? `1px solid ${BORDER}` : 'none',
									background: isYou ? PURPLE_DIM : 'transparent',
									opacity: itemOpacity,
									transform: `translateY(${itemY}px)`,
								}}
							>
								<div style={{width: 32, fontSize: 20, fontWeight: 900, color: '#333', textAlign: 'center'}}>
									{entry.rank <= 3 ? medal[entry.rank - 1] : `#${entry.rank}`}
								</div>
								<div style={{flex: 1, fontSize: 18, fontWeight: isYou ? 800 : 600, color: isYou ? '#fff' : '#aaa'}}>
									{entry.name}
								</div>
								<div style={{textAlign: 'right'}}>
									<div style={{fontSize: 20, fontWeight: 800, color: isYou ? PURPLE : '#fff'}}>
										{entry.workouts} <span style={{fontSize: 13, color: '#444', fontWeight: 500}}>workouts</span>
									</div>
									<div style={{fontSize: 13, color: '#444', marginTop: 2}}>🔥 {entry.streak} streak</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Bottom CTA text */}
			<div
				style={{
					position: 'absolute',
					bottom: 100,
					left: 60,
					right: 60,
					fontSize: 38,
					fontWeight: 800,
					color: '#fff',
					lineHeight: 1.2,
					textAlign: 'center',
					opacity: interpolate(frame, [155, 175], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
				}}
			>
				you can't quietly quit.{' '}
				<span style={{color: PURPLE}}>your people see everything.</span>
			</div>
		</div>
	);
};

export const ChudToChad = () => {
	return (
		<Series>
			<Series.Sequence durationInFrames={150}>
				<VideoScene src="1scroll_tiktok.MOV" text="me every day for 6 months" />
			</Series.Sequence>
			<Series.Sequence durationInFrames={90}>
				<VideoScene src="2get_up.MOV" text="" />
			</Series.Sequence>
			<Series.Sequence durationInFrames={150}>
				<VideoScene src="3dopamine_eat.MOV" text="I kept telling myself I'd start Monday" />
			</Series.Sequence>
			<Series.Sequence durationInFrames={150}>
				<VideoScene src="4mirror.MOV" text="went to the gym twice that month" />
			</Series.Sequence>
			<Series.Sequence durationInFrames={200}>
				<UpliftAppScene />
			</Series.Sequence>
			<Series.Sequence durationInFrames={150}>
				<PlaceholderScene label="SCENE 6 — Consistency montage" text="30 days straight" />
			</Series.Sequence>
			<Series.Sequence durationInFrames={120}>
				<PlaceholderScene label="SCENE 7 — Chadified mirror shot" text="Become your best self together." />
			</Series.Sequence>
		</Series>
	);
};