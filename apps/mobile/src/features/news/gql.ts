import { gql } from "@apollo/client";

export type Article = {
	__typename: "Article";
	id: string;
	title: string;
	summary: string;
	publishedAt: string;
};

export const NEWS = gql`
	query News {
		news {
			id
			title
			summary
			publishedAt
		}
	}
`;
