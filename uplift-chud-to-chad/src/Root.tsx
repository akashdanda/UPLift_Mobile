import {Composition} from 'remotion';
import {ChudToChad} from './Composition';
 
export const RemotionRoot = () => {
	return (
		<Composition
			id="ChudToChad"
			component={ChudToChad}
			durationInFrames={30 * 70}
			fps={30}
			width={1080}
			height={1920}
		/>
	);
};
 